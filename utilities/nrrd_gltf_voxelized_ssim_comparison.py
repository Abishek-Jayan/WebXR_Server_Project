import os
import numpy as np
import trimesh
import nrrd
from skimage.metrics import structural_similarity as ssim, peak_signal_noise_ratio as psnr
from scipy.ndimage import affine_transform
from datetime import datetime, timezone

NRRD_DIR      = "../image_server/public/static/paper_datasets/true_datasets"
GLB_DIR       = "../image_server/public/static/paper_datasets/GLB _FILES"
VOXEL_OUT_DIR = "../image_server/public/static/paper_datasets/voxelized_meshes"
LOG_DIR       = "../logs"

# Cap each axis at this many voxels for voxelization + metric computation.
# Keeps peak RAM under ~2 GB for float32 volumes.
MAX_METRIC_DIM = 900

# Explicit pairing: nrrd filename -> glb filename
PAIRS = {
    "1_V2_ventral_nerve_cord.nrrd":               "v1_nerve.glb",
    "2_T1_intersex_brain_template.nrrd":          "t2_intersex_brain.glb",
    "3_RatC_greyscale.nrrd":                      "ratc.glb",
    "5_RatA_greyscale.nrrd":                      "Rat_A.glb",
}


def check_alignment(mesh, origin, space_dirs, sizes):
    """Report world-space bounding box overlap between the NRRD voxel grid and the mesh."""
    corners = np.array(
        [[i, j, k]
         for i in [0, sizes[0] - 1]
         for j in [0, sizes[1] - 1]
         for k in [0, sizes[2] - 1]],
        dtype=float,
    )
    world_corners = origin + (space_dirs.T @ corners.T).T
    nrrd_min = world_corners.min(axis=0)
    nrrd_max = world_corners.max(axis=0)

    mesh_min = mesh.bounds[0]
    mesh_max = mesh.bounds[1]

    print(f"  NRRD world bbox : {np.round(nrrd_min, 3)} → {np.round(nrrd_max, 3)}")
    print(f"  Mesh world bbox : {np.round(mesh_min, 3)} → {np.round(mesh_max, 3)}")

    overlap_min = np.maximum(nrrd_min, mesh_min)
    overlap_max = np.minimum(nrrd_max, mesh_max)
    overlap_size = overlap_max - overlap_min

    if np.all(overlap_size > 0):
        mesh_extent = mesh_max - mesh_min
        overlap_frac = np.prod(overlap_size) / (np.prod(mesh_extent) + 1e-12)
        print(f"  Alignment OK — mesh overlap with NRRD grid: {overlap_frac:.1%}")
    else:
        print("  WARNING: mesh and NRRD volume do NOT overlap in world space — "
              "voxelized result will be all zeros. Check coordinate systems.")


def voxelize_mesh(glb_path, sizes, origin, space_dirs, output_path=None):
    """
    Voxelize a GLB mesh into the coordinate space of an NRRD volume.

    The mesh is center-aligned and uniformly scaled to fit the NRRD world bbox
    before voxelization.  Because the caller already caps `sizes` to MAX_METRIC_DIM,
    the trimesh intermediate grid stays small without any coarsening — preserving
    accurate surface boundaries at the comparison resolution.

    Parameters
    ----------
    glb_path    : path to .glb file
    sizes       : [N0, N1, N2] voxel counts (already downsampled by caller if needed)
    origin      : (3,) world-space origin from NRRD header
    space_dirs  : (3, 3) world-space step per axis (already scaled if downsampled)
    output_path : if given, save the voxelized result as an NRRD file

    Returns
    -------
    result : float32 ndarray of shape tuple(sizes), values 0.0 / 1.0
    """
    scene = trimesh.load(glb_path, force="scene")
    mesh = scene.to_mesh() if isinstance(scene, trimesh.Scene) else scene

    check_alignment(mesh, origin, space_dirs, sizes)

    # Align mesh to NRRD world bbox: center-align and uniformly scale so the
    # mesh's largest axis matches the NRRD's largest axis.
    corners = np.array(
        [[i, j, k]
         for i in [0, sizes[0] - 1]
         for j in [0, sizes[1] - 1]
         for k in [0, sizes[2] - 1]], dtype=float,
    )
    world_corners = origin + (space_dirs.T @ corners.T).T
    nrrd_min    = world_corners.min(axis=0)
    nrrd_max    = world_corners.max(axis=0)
    nrrd_center = (nrrd_min + nrrd_max) / 2
    nrrd_extent = nrrd_max - nrrd_min

    mesh_center = (mesh.bounds[0] + mesh.bounds[1]) / 2
    mesh_extent = mesh.bounds[1] - mesh.bounds[0]
    scale = float(np.max(nrrd_extent) / np.max(mesh_extent))

    mesh.apply_translation(-mesh_center)
    mesh.apply_scale(scale)
    mesh.apply_translation(nrrd_center)
    print(f"  Aligned mesh: center {np.round(mesh_center, 2)} → {np.round(nrrd_center, 2)}, "
          f"scale ×{scale:.3f}")
    check_alignment(mesh, origin, space_dirs, sizes)

    # Pitch = finest NRRD voxel spacing. Because sizes is already capped to
    # MAX_METRIC_DIM by the caller, the trimesh grid is also bounded — no coarsening needed.
    pitch = float(np.min([np.linalg.norm(space_dirs[i]) for i in range(3)]))

    # trimesh ray-casting voxelization — O(N^2) scanlines, not O(N^3) point tests
    vox   = mesh.voxelized(pitch).fill()
    dense = vox.matrix.astype(np.float32)

    # Build the affine: NRRD ijk  →  trimesh voxel ijk
    #
    # NRRD forward:  world = origin + space_dirs.T @ nrrd_ijk
    # Trimesh inv:   tvox_ijk = R @ world + t
    #
    # scipy affine_transform samples input at:  A @ output_coord + b
    world_to_vox = np.linalg.inv(vox.transform)
    R = world_to_vox[:3, :3]
    t = world_to_vox[:3,  3]

    A = R @ space_dirs.T
    b = R @ origin + t

    result = affine_transform(
        dense, A, offset=b,
        output_shape=tuple(sizes),
        order=0,
        mode="constant", cval=0.0,
    )

    if output_path:
        os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
        nrrd.write(output_path, result)
        print(f"  Saved voxelized mesh → {output_path}")

    return result


def compute_ssim(nrrd_vol, mesh_vol):
    """Per-slice SSIM averaged over axis 0. Normalises per-slice to avoid OOM."""
    v_min, v_max = nrrd_vol.min(), nrrd_vol.max()
    data_range = float(v_max - v_min) + 1e-8

    scores = []
    for i in range(nrrd_vol.shape[0]):
        sl_a = (nrrd_vol[i].astype(np.float32) - v_min) / data_range
        sl_b = mesh_vol[i]
        min_dim = min(sl_a.shape)
        win_size = min(7, min_dim if min_dim % 2 == 1 else min_dim - 1)
        if win_size < 1:
            continue
        scores.append(ssim(sl_a, sl_b, data_range=1.0, win_size=win_size))
    return float(np.mean(scores))


def compute_psnr(nrrd_vol, mesh_vol):
    """Per-slice PSNR averaged over axis 0. Uses skimage.metrics.peak_signal_noise_ratio."""
    v_min, v_max = nrrd_vol.min(), nrrd_vol.max()
    data_range = float(v_max - v_min) + 1e-8

    scores = []
    for i in range(nrrd_vol.shape[0]):
        sl_a = (nrrd_vol[i].astype(np.float32) - v_min) / data_range
        sl_b = mesh_vol[i]
        scores.append(psnr(sl_a, sl_b, data_range=1.0))
    return float(np.mean(scores))


results = {}

for nrrd_file, glb_file in PAIRS.items():
    nrrd_path = f"{NRRD_DIR}/{nrrd_file}"
    glb_path  = f"{GLB_DIR}/{glb_file}"

    stem = os.path.splitext(nrrd_file)[0]

    print(f"\nProcessing: {nrrd_file} <-> {glb_file}")

    orig, hdr = nrrd.read(nrrd_path, index_order="C")
    space_dirs = np.asarray(hdr["space directions"], dtype=float)
    origin     = np.asarray(hdr.get("space origin", np.zeros(3)), dtype=float)

    hdr_sizes = tuple(int(x) for x in hdr["sizes"])
    print(f"  hdr sizes: {hdr_sizes}  |  orig.shape: {orig.shape}")

    # nrrd.read(index_order='C') reverses axes vs NRRD file order when they differ.
    if hdr_sizes != orig.shape:
        space_dirs = space_dirs[::-1].copy()
        print("  (reversed space_dirs to match C-order array axes)")

    sizes = np.array(orig.shape)
    print(f"  Volume shape: {orig.shape}")

    # Downsample if any axis exceeds MAX_METRIC_DIM to avoid OOM on large volumes.
    scale_factor = min(1.0, MAX_METRIC_DIM / float(sizes.max()))
    if scale_factor < 1.0:
        import math
        from skimage.transform import downscale_local_mean
        ds = tuple(max(1, math.ceil(1.0 / scale_factor)) for _ in range(3))
        orig = downscale_local_mean(orig, ds).astype(np.float32)
        space_dirs = space_dirs * np.array(ds)[:, None]
        sizes = np.array(orig.shape)
        print(f"  Downsampled by {ds} → shape {orig.shape} for metric computation")

    out_path = f"{VOXEL_OUT_DIR}/{stem}_voxelized.nrrd"

    if os.path.exists(out_path):
        cached, _ = nrrd.read(out_path, index_order="C")
        if cached.shape == tuple(sizes):
            print(f"  Loading cached voxelized mesh from {out_path}")
            mesh_vol = cached.astype(np.float32)
        else:
            print(f"  Cached shape {cached.shape} != expected {tuple(sizes)}, re-voxelizing")
            mesh_vol = voxelize_mesh(glb_path, sizes, origin, space_dirs, output_path=out_path)
    else:
        mesh_vol = voxelize_mesh(glb_path, sizes, origin, space_dirs, output_path=out_path)
    print(f"  Mesh voxelized: {int(mesh_vol.sum())} voxels inside mesh")

    ssim_score = compute_ssim(orig, mesh_vol)
    psnr_score = compute_psnr(orig, mesh_vol)
    results[nrrd_file] = {"ssim": ssim_score, "psnr": psnr_score}
    print(f"  SSIM: {ssim_score:.4f}  |  PSNR: {psnr_score:.2f} dB")

print("\n=== Results ===")
for name, scores in results.items():
    print(f"  {name}: SSIM={scores['ssim']:.4f}  PSNR={scores['psnr']:.2f} dB")

log_path = os.path.join(LOG_DIR, "ssim_results.log")
os.makedirs(LOG_DIR, exist_ok=True)
with open(log_path, "a") as f:
    f.write(f"\n[{datetime.now(timezone.utc).isoformat()}] SSIM + PSNR Results\n")
    for name, scores in results.items():
        f.write(f"  {name}: SSIM={scores['ssim']:.4f}  PSNR={scores['psnr']:.2f} dB\n")
print(f"\nResults appended to {log_path}")

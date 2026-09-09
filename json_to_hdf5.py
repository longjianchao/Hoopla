import json
import numpy as np
import os
import h5py

filename = 'Figure_29_mask_data_2025-09-09T02-53-35.h5.json'

# Read JSON data
with open('masks/' + filename, 'r') as f:
    data = json.load(f)

# Convert JSON data to .h5 format
def convert_to_h5(json_data, h5_filename=filename.replace('.json', '.h5')):
    with h5py.File(h5_filename, 'w') as f:
        # Store the full image
        image_data = np.array(json_data['full_image_gray']['data'], dtype=float).reshape(
            json_data['image_info']['height'], json_data['image_info']['width']
        )
        f.create_dataset('full_image_gray', data=image_data)
        
        # Create the masks group
        masks_group = f.create_group('masks')
        for mask_name, mask_data in json_data['masks'].items():
            mask_group = masks_group.create_group(mask_name)
            
            # Process pixels data - new structure
            pixels_data = mask_data['pixels']['data']
            pixels = np.array([p if p is not None else np.nan for p in pixels_data], dtype=float)
            mask_group.create_dataset('pixels', data=pixels)
            
            # Process valid_pixels data
            valid_pixels_data = mask_data['valid_pixels']['data']
            valid_pixels = np.array(valid_pixels_data, dtype=float)
            mask_group.create_dataset('valid_pixels', data=valid_pixels)
            
            # Store metadata
            metadata_group = mask_group.create_group('metadata')
            for key, value in mask_data['metadata'].items():
                if key == 'bounding_box':
                    bbox_group = metadata_group.create_group('bounding_box')
                    for bbox_key, bbox_value in value.items():
                        bbox_group.attrs[bbox_key] = bbox_value
                else:
                    metadata_group.attrs[key] = value

# Convert data to .h5
convert_to_h5(data)

# Read data from the .h5 file
def read_from_h5(h5_filename='converted_data.h5'):
    data = {}
    with h5py.File(h5_filename, 'r') as f:
        # Read the full image
        data['full_image_gray'] = f['full_image_gray'][:]
        
        # Read masks
        data['masks'] = {}
        for mask_name in f['masks']:
            mask_group = f['masks'][mask_name]
            
            # Read pixels data and handle NaN values
            pixels = mask_group['pixels'][:]
            pixels_list = [float(p) if not np.isnan(p) else None for p in pixels]
            
            valid_pixels = mask_group['valid_pixels'][:]
            valid_pixels_list = valid_pixels.tolist()
            
            mask_data = {
                'pixels': {'data': pixels_list},
                'valid_pixels': {'data': valid_pixels_list},
                'metadata': {}
            }
            
            # Read metadata
            for key, value in mask_group['metadata'].attrs.items():
                mask_data['metadata'][key] = value
            
            # Add bounding_box
            if 'bounding_box' in mask_group['metadata']:
                mask_data['metadata']['bounding_box'] = dict(mask_group['metadata/bounding_box'].attrs)
            
            data['masks'][mask_name] = mask_data
    
    return data

# Use the .h5 data
h5_data = read_from_h5()
data = h5_data  # Use the .h5 data

# Get the full image
full_image = np.array(data['full_image_gray'])
print(f"Image size: {full_image.shape}")

# Get mask data
mask1_pixels = np.array(data['masks']['mask_1']['pixels']['data'], dtype=float)
metadata = data['masks']['mask_1']['metadata']
print(f"Mask 1 position: ({metadata['x']}, {metadata['y']})")
print(f"Mask 1 radius: {metadata['radius']}")
print(f"Valid pixel count: {metadata['valid_pixel_count']}")

# Process valid pixels
valid_pixels = np.array(data['masks']['mask_1']['valid_pixels']['data'], dtype=float)
mean_value = np.mean(valid_pixels)
print(f"Mean pixel value: {mean_value}")


# Plot all masks
import matplotlib.pyplot as plt
from matplotlib.patches import Circle

# Configure Chinese font support
plt.rcParams['font.sans-serif'] = ['SimHei', 'Microsoft YaHei']
plt.rcParams['axes.unicode_minus'] = False

# Create a large figure showing all masks
fig, axes = plt.subplots(2, 5, figsize=(20, 8))
axes = axes.flatten()

for idx, (mask_name, mask_data) in enumerate(data['masks'].items()):
    if idx < 10:  # Only show the first 10 masks
        ax = axes[idx]
        
        # Get mask data
        pixels = np.array(mask_data['pixels']['data'], dtype=float)
        metadata = mask_data['metadata']
        
        # Reshape into a 2D image
        height = metadata['bounding_box']['height']
        width = metadata['bounding_box']['width']
        pixels = pixels.reshape(height, width)
        
        # Plot the mask using the hot colormap
        im = ax.imshow(pixels, cmap='hot', origin='lower')
        
        # Add the circular boundary
        circle = Circle((metadata['x'] - metadata['bounding_box']['min_x'],
                        metadata['y'] - metadata['bounding_box']['min_y']),
                       metadata['radius'],
                       fill=False, color='white', linewidth=2)
        ax.add_patch(circle)
        
        # Set the title
        ax.set_title(f'{mask_name}\n'
                    f'Center: ({metadata["x"]:.1f}, {metadata["y"]:.1f})\n'
                    f'Radius: {metadata["radius"]:.1f}')
        ax.axis('off')

# Hide unused subplots
for idx in range(len(data['masks']), 10):
    axes[idx].set_visible(False)

plt.suptitle('All Mask Visualization (using hot colormap)', fontsize=16)
plt.tight_layout()
plt.savefig('all_masks_hot.png', dpi=300, bbox_inches='tight')
plt.show()

# Plot each mask individually as a large image
output_dir = 'mask_individual_plots'
if not os.path.exists(output_dir):
    os.makedirs(output_dir)

for mask_name, mask_data in data['masks'].items():
    plt.figure(figsize=(8, 8))
    
    pixels = np.array(mask_data['pixels']['data'], dtype=float)
    metadata = mask_data['metadata']
    
    # Reshape into a 2D image
    height = metadata['bounding_box']['height']
    width = metadata['bounding_box']['width']
    pixels = pixels.reshape(height, width)
    
    plt.imshow(pixels, cmap='hot', origin='lower')
    plt.colorbar(label='Pixel value')
    
    # Add the circular boundary
    circle = Circle((metadata['x'] - metadata['bounding_box']['min_x'],
                    metadata['y'] - metadata['bounding_box']['min_y']),
                   metadata['radius'],
                   fill=False, color='white', linewidth=2)
    plt.gca().add_patch(circle)
    
    plt.title(f'{mask_name} - using hot colormap\n'
             f'Center: ({metadata["x"]:.1f}, {metadata["y"]:.1f}) Radius: {metadata["radius"]:.1f}')
    plt.tight_layout()
    plt.savefig(f'{output_dir}/{mask_name}_hot.png', dpi=300, bbox_inches='tight')
    plt.close()

print(f"All masks have been plotted and saved in the {output_dir} directory")
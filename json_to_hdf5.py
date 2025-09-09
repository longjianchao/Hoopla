import json
import numpy as np
import os
import h5py

filename = 'Figure_29_mask_data_2025-09-09T02-53-35.h5.json'

# 读取JSON数据
with open('masks/' + filename, 'r') as f:
    data = json.load(f)

# 将JSON数据转换为.h5格式
def convert_to_h5(json_data, h5_filename=filename.replace('.json', '.h5')):
    with h5py.File(h5_filename, 'w') as f:
        # 存储完整图像
        image_data = np.array(json_data['full_image_gray']['data'], dtype=float).reshape(
            json_data['image_info']['height'], json_data['image_info']['width']
        )
        f.create_dataset('full_image_gray', data=image_data)
        
        # 创建masks组
        masks_group = f.create_group('masks')
        for mask_name, mask_data in json_data['masks'].items():
            mask_group = masks_group.create_group(mask_name)
            
            # 处理pixels数据 - 新结构
            pixels_data = mask_data['pixels']['data']
            pixels = np.array([p if p is not None else np.nan for p in pixels_data], dtype=float)
            mask_group.create_dataset('pixels', data=pixels)
            
            # 处理valid_pixels数据
            valid_pixels_data = mask_data['valid_pixels']['data']
            valid_pixels = np.array(valid_pixels_data, dtype=float)
            mask_group.create_dataset('valid_pixels', data=valid_pixels)
            
            # 存储元数据
            metadata_group = mask_group.create_group('metadata')
            for key, value in mask_data['metadata'].items():
                if key == 'bounding_box':
                    bbox_group = metadata_group.create_group('bounding_box')
                    for bbox_key, bbox_value in value.items():
                        bbox_group.attrs[bbox_key] = bbox_value
                else:
                    metadata_group.attrs[key] = value

# 转换数据为.h5
convert_to_h5(data)

# 从.h5文件读取数据
def read_from_h5(h5_filename='converted_data.h5'):
    data = {}
    with h5py.File(h5_filename, 'r') as f:
        # 读取完整图像
        data['full_image_gray'] = f['full_image_gray'][:]
        
        # 读取masks
        data['masks'] = {}
        for mask_name in f['masks']:
            mask_group = f['masks'][mask_name]
            
            # 读取像素数据并处理NaN值
            pixels = mask_group['pixels'][:]
            pixels_list = [float(p) if not np.isnan(p) else None for p in pixels]
            
            valid_pixels = mask_group['valid_pixels'][:]
            valid_pixels_list = valid_pixels.tolist()
            
            mask_data = {
                'pixels': {'data': pixels_list},
                'valid_pixels': {'data': valid_pixels_list},
                'metadata': {}
            }
            
            # 读取元数据
            for key, value in mask_group['metadata'].attrs.items():
                mask_data['metadata'][key] = value
            
            # 添加bounding_box
            if 'bounding_box' in mask_group['metadata']:
                mask_data['metadata']['bounding_box'] = dict(mask_group['metadata/bounding_box'].attrs)
            
            data['masks'][mask_name] = mask_data
    
    return data

# 使用.h5数据
h5_data = read_from_h5()
data = h5_data  # 使用.h5数据

# 获取完整图像
full_image = np.array(data['full_image_gray'])
print(f"图像大小: {full_image.shape}")

# 获取mask数据
mask1_pixels = np.array(data['masks']['mask_1']['pixels']['data'], dtype=float)
metadata = data['masks']['mask_1']['metadata']
print(f"Mask 1位置: ({metadata['x']}, {metadata['y']})")
print(f"Mask 1半径: {metadata['radius']}")
print(f"有效像素数: {metadata['valid_pixel_count']}")

# 处理有效像素
valid_pixels = np.array(data['masks']['mask_1']['valid_pixels']['data'], dtype=float)
mean_value = np.mean(valid_pixels)
print(f"平均像素值: {mean_value}")


# 绘制所有mask
import matplotlib.pyplot as plt
from matplotlib.patches import Circle

# 设置中文字体
plt.rcParams['font.sans-serif'] = ['SimHei', 'Microsoft YaHei']
plt.rcParams['axes.unicode_minus'] = False

# 创建大图展示所有mask
fig, axes = plt.subplots(2, 5, figsize=(20, 8))
axes = axes.flatten()

for idx, (mask_name, mask_data) in enumerate(data['masks'].items()):
    if idx < 10:  # 只显示前10个mask
        ax = axes[idx]
        
        # 获取mask数据
        pixels = np.array(mask_data['pixels']['data'], dtype=float)
        metadata = mask_data['metadata']
        
        # 重塑为二维图像
        height = metadata['bounding_box']['height']
        width = metadata['bounding_box']['width']
        pixels = pixels.reshape(height, width)
        
        # 使用hot colormap绘制mask
        im = ax.imshow(pixels, cmap='hot', origin='lower')
        
        # 添加圆形边界
        circle = Circle((metadata['x'] - metadata['bounding_box']['min_x'], 
                        metadata['y'] - metadata['bounding_box']['min_y']), 
                       metadata['radius'], 
                       fill=False, color='white', linewidth=2)
        ax.add_patch(circle)
        
        # 设置标题
        ax.set_title(f'{mask_name}\n'
                    f'中心: ({metadata["x"]:.1f}, {metadata["y"]:.1f})\n'
                    f'半径: {metadata["radius"]:.1f}')
        ax.axis('off')

# 隐藏多余的子图
for idx in range(len(data['masks']), 10):
    axes[idx].set_visible(False)

plt.suptitle('所有Mask可视化 (使用hot colormap)', fontsize=16)
plt.tight_layout()
plt.savefig('all_masks_hot.png', dpi=300, bbox_inches='tight')
plt.show()

# 单独绘制每个mask的大图
output_dir = 'mask_individual_plots'
if not os.path.exists(output_dir):
    os.makedirs(output_dir)

for mask_name, mask_data in data['masks'].items():
    plt.figure(figsize=(8, 8))
    
    pixels = np.array(mask_data['pixels']['data'], dtype=float)
    metadata = mask_data['metadata']
    
    # 重塑为二维图像
    height = metadata['bounding_box']['height']
    width = metadata['bounding_box']['width']
    pixels = pixels.reshape(height, width)
    
    plt.imshow(pixels, cmap='hot', origin='lower')
    plt.colorbar(label='像素值')
    
    # 添加圆形边界
    circle = Circle((metadata['x'] - metadata['bounding_box']['min_x'], 
                    metadata['y'] - metadata['bounding_box']['min_y']), 
                   metadata['radius'], 
                   fill=False, color='white', linewidth=2)
    plt.gca().add_patch(circle)
    
    plt.title(f'{mask_name} - 使用hot colormap\n'
             f'中心: ({metadata["x"]:.1f}, {metadata["y"]:.1f}) 半径: {metadata["radius"]:.1f}')
    plt.tight_layout()
    plt.savefig(f'{output_dir}/{mask_name}_hot.png', dpi=300, bbox_inches='tight')
    plt.close()

print(f"所有mask已绘制完成，保存在 {output_dir} 目录中")
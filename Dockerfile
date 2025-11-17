# 使用官方nginx作为基础镜像
FROM nginx:latest

# 设置工作目录
WORKDIR /usr/share/nginx/html

# 复制项目文件到nginx目录
COPY . /usr/share/nginx/html/

# 暴露端口
EXPOSE 80

# 启动nginx
CMD ["nginx", "-g", "daemon off;"]
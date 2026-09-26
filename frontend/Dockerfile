ARG DOCKER_IMAGE_PREFIX=""
# Nginx Production Stage
FROM ${DOCKER_IMAGE_PREFIX}nginx:stable-alpine
COPY dist /usr/share/nginx/html
# Custom Nginx configuration for React router support
RUN echo 'map $http_x_forwarded_proto $forwarded_proto { \
    default $http_x_forwarded_proto; \
    "" $scheme; \
    } \
    map $http_x_real_ip $client_real_ip { \
    default $http_x_real_ip; \
    "" $remote_addr; \
    } \
    log_format frontend_log "$client_real_ip - $remote_user [$time_local] \"$request\" $status $body_bytes_sent \"$http_referer\" \"$http_user_agent\" \"$http_x_forwarded_for\""; \
    server { \
    listen 80; \
    set_real_ip_from 127.0.0.1; \
    set_real_ip_from 172.17.0.0/16; \
    set_real_ip_from 172.18.0.0/15; \
    set_real_ip_from 172.20.0.0/14; \
    set_real_ip_from 172.24.0.0/13; \
    real_ip_header X-Forwarded-For; \
    real_ip_recursive on; \
    client_max_body_size 512m; \
    proxy_next_upstream off; \
    access_log /var/log/nginx/access.log frontend_log; \
    # /home/models、/models 由 React SPA 渲染（含查询参数刷新也回 index.html）
    location ^~ /home/models { \
    root /usr/share/nginx/html; \
    try_files $uri /index.html; \
    } \
    location ^~ /models { \
    root /usr/share/nginx/html; \
    try_files $uri /index.html; \
    } \
    location /home-pro/docs { \
    root /usr/share/nginx/html; \
    try_files $uri /index.html; \
    } \
    # 其余门户路径代理到后端
    location /home { \
    proxy_pass http://backend:3000; \
    proxy_set_header Host $host; \
    proxy_set_header X-Real-IP $client_real_ip; \
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; \
    proxy_set_header X-Forwarded-Proto $forwarded_proto; \
    proxy_connect_timeout 900s; \
    proxy_send_timeout 900s; \
    proxy_read_timeout 900s; \
    } \
    # 其他路径保持原有前端SPA逻辑
    location / { \
    root /usr/share/nginx/html; \
    index index.html index.htm; \
    try_files $uri $uri/ /index.html; \
    } \
    location /assets/icons/ { \
    proxy_pass http://backend:3000; \
    proxy_set_header Host $host; \
    proxy_set_header X-Real-IP $client_real_ip; \
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; \
    proxy_set_header X-Forwarded-Proto $forwarded_proto; \
    proxy_connect_timeout 900s; \
    proxy_send_timeout 900s; \
    proxy_read_timeout 900s; \
    } \
    location /api { \
    proxy_pass http://backend:3000; \
    proxy_set_header Host $host; \
    proxy_set_header X-Real-IP $client_real_ip; \
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; \
    proxy_set_header X-Forwarded-Proto $forwarded_proto; \
    proxy_set_header X-Forwarded-Host $host; \
    proxy_buffering off; \
    proxy_cache off; \
    chunked_transfer_encoding on; \
    proxy_connect_timeout 900s; \
    proxy_send_timeout 900s; \
    proxy_read_timeout 900s; \
    } \
    location /v1 { \
        proxy_pass http://backend:3000; \
        proxy_set_header Host $host; \
        proxy_set_header X-Real-IP $client_real_ip; \
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; \
        proxy_set_header X-Forwarded-Proto $forwarded_proto; \
        proxy_buffering off; \
        proxy_cache off; \
        chunked_transfer_encoding on; \
        proxy_connect_timeout 900s; \
        proxy_send_timeout 900s; \
        proxy_read_timeout 900s; \
    } \
    location /v2 { \
        proxy_pass http://backend:3000; \
        proxy_set_header Host $host; \
        proxy_set_header X-Real-IP $client_real_ip; \
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; \
        proxy_set_header X-Forwarded-Proto $forwarded_proto; \
        proxy_buffering off; \
        proxy_cache off; \
        chunked_transfer_encoding on; \
        proxy_connect_timeout 900s; \
        proxy_send_timeout 900s; \
        proxy_read_timeout 900s; \
    } \
    location /compatible-mode { \
        proxy_pass http://backend:3000; \
        proxy_set_header Host $host; \
        proxy_set_header X-Real-IP $client_real_ip; \
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; \
        proxy_set_header X-Forwarded-Proto $forwarded_proto; \
        proxy_buffering off; \
        proxy_cache off; \
        chunked_transfer_encoding on; \
        proxy_connect_timeout 900s; \
        proxy_send_timeout 900s; \
        proxy_read_timeout 900s; \
    } \
    location /compatible-api { \
        proxy_pass http://backend:3000; \
        proxy_set_header Host $host; \
        proxy_set_header X-Real-IP $client_real_ip; \
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; \
        proxy_set_header X-Forwarded-Proto $forwarded_proto; \
        proxy_buffering off; \
        proxy_cache off; \
        chunked_transfer_encoding on; \
        proxy_connect_timeout 900s; \
        proxy_send_timeout 900s; \
        proxy_read_timeout 900s; \
    } \
    location /anthropic { \
        proxy_pass http://backend:3000; \
        proxy_set_header Host $host; \
        proxy_set_header X-Real-IP $client_real_ip; \
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; \
        proxy_set_header X-Forwarded-Proto $forwarded_proto; \
        proxy_buffering off; \
        proxy_cache off; \
        chunked_transfer_encoding on; \
        proxy_connect_timeout 900s; \
        proxy_send_timeout 900s; \
        proxy_read_timeout 900s; \
    } \
    location /v1beta { \
        proxy_pass http://backend:3000; \
        proxy_set_header Host $host; \
        proxy_set_header X-Real-IP $client_real_ip; \
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; \
        proxy_set_header X-Forwarded-Proto $forwarded_proto; \
        proxy_buffering off; \
        proxy_cache off; \
        chunked_transfer_encoding on; \
        proxy_connect_timeout 900s; \
        proxy_send_timeout 900s; \
        proxy_read_timeout 900s; \
    } \
    location /text-to-video { \
        proxy_pass http://backend:3000; \
        proxy_set_header Host $host; \
        proxy_set_header X-Real-IP $client_real_ip; \
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; \
        proxy_set_header X-Forwarded-Proto $forwarded_proto; \
        proxy_buffering off; \
        proxy_cache off; \
        chunked_transfer_encoding on; \
        proxy_connect_timeout 900s; \
        proxy_send_timeout 900s; \
        proxy_read_timeout 900s; \
    } \
    location /image-to-video { \
        proxy_pass http://backend:3000; \
        proxy_set_header Host $host; \
        proxy_set_header X-Real-IP $client_real_ip; \
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; \
        proxy_set_header X-Forwarded-Proto $forwarded_proto; \
        proxy_buffering off; \
        proxy_cache off; \
        chunked_transfer_encoding on; \
        proxy_connect_timeout 900s; \
        proxy_send_timeout 900s; \
        proxy_read_timeout 900s; \
    } \
    location /omni-video { \
        proxy_pass http://backend:3000; \
        proxy_set_header Host $host; \
        proxy_set_header X-Real-IP $client_real_ip; \
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; \
        proxy_set_header X-Forwarded-Proto $forwarded_proto; \
        proxy_buffering off; \
        proxy_cache off; \
        chunked_transfer_encoding on; \
        proxy_connect_timeout 900s; \
        proxy_send_timeout 900s; \
        proxy_read_timeout 900s; \
    } \
    location /tasks { \
        proxy_pass http://backend:3000; \
        proxy_set_header Host $host; \
        proxy_set_header X-Real-IP $client_real_ip; \
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; \
        proxy_set_header X-Forwarded-Proto $forwarded_proto; \
        proxy_buffering off; \
        proxy_cache off; \
        chunked_transfer_encoding on; \
        proxy_connect_timeout 900s; \
        proxy_send_timeout 900s; \
        proxy_read_timeout 900s; \
    } \
}' > /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["sh", "-c", "sed -i \"s/client_max_body_size [0-9]*[kmgMGTK]*;/client_max_body_size ${CLIENT_MAX_BODY_SIZE:-50m};/\" /etc/nginx/conf.d/default.conf && nginx -g 'daemon off;'"]

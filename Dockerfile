# Việt Anh MagicStudio — image chạy trên Coolify (build pack: Dockerfile, cổng 3000)
FROM node:22-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
# Biến NEXT_PUBLIC_* được nhúng lúc build: khai báo trong Coolify (Build Variable) nếu cần.
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=$NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
# next.config.ts cần typescript lúc chạy nên giữ nguyên node_modules (gồm devDependencies);
# vì vậy KHÔNG chạy `npm prune --omit=dev` (sẽ làm next start không đọc được cấu hình).
COPY --from=build /app/package.json /app/package-lock.json /app/next.config.ts /app/tsconfig.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/scripts ./scripts
# Nhật ký sử dụng, ghi chú lớp: gắn volume vào /app/.data để không mất khi deploy lại.
RUN mkdir -p /app/.data && chown -R node:node /app/.data /app/.next
USER node
EXPOSE 3000
# Kiểm tra sống bằng node (ảnh slim không có curl).
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3   CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node_modules/.bin/next", "start", "-p", "3000", "-H", "0.0.0.0"]

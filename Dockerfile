FROM node:24.22.1-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.json ./
RUN npm ci
COPY server/ ./server/
RUN npm run build && npm prune --omit=dev

FROM node:24.22.1-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8080 TZ=UTC AV_DATA_DIR=/app/avian/data
COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules/ ./node_modules/
COPY --from=build /app/dist/server/ ./dist/server/
COPY avian/frontend/ ./avian/frontend/
COPY avian/assets/illustrations/ ./avian/assets/illustrations/
COPY avian/assets/cutouts/ ./avian/assets/cutouts/
COPY avian/assets/loading-animation-cutouts/ ./avian/assets/loading-animation-cutouts/
COPY avian/assets/favicon.png ./avian/assets/favicon.png
COPY avian/data/ebird.example.json ./avian/data/ebird.example.json
RUN chown -R node:node /app/avian/data
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD ["node", "-e", "fetch('http://127.0.0.1:8080/').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]
CMD ["node", "dist/server/index.js"]

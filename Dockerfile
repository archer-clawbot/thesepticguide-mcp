FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json tsconfig.json ./
RUN npm ci
COPY src ./src
RUN npm run build && npm prune --omit=dev

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY data ./data
COPY package.json LICENSE README.md ./
USER node
# Default: stdio (Docker MCP catalog, Glama). For HTTP: docker run -p 3000:3000 IMAGE node dist/local-http.js
ENTRYPOINT ["node", "dist/stdio.js"]

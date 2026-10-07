# check-db — build for production (arm64 via Actions/QEMU)
# npm install, not npm ci - no lockfile committed (Pi has no node toolchain;
# camelot-wheel and check-bpm proved this pattern).
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json ./
RUN npm install
COPY . .
RUN npm run build

# adapter-node output = a self-contained node server
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/build ./build
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
EXPOSE 3000
CMD ["node", "build"]
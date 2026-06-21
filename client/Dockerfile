# Build from repo root: docker build -f client/Dockerfile .
FROM node:20 AS build

WORKDIR /app/client
COPY client/package*.json ./
RUN npm install

COPY client/ ./
# Shared Zod schema resolved via vite alias (../server/...)
COPY server/src/validators/courseWizard.schema.js ../server/src/validators/courseWizard.schema.js

RUN npm run build

FROM node:20 AS production

WORKDIR /app/client
COPY client/package*.json ./
RUN npm install

COPY client/vite.config.js ./vite.config.js
COPY --from=build /app/client/dist ./dist

ENV NODE_ENV=production
EXPOSE 4173

CMD ["npm", "start"]

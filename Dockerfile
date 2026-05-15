# syntax=docker/dockerfile:1.7
# Container image for @oldfamilyrecipe/mcp-server
# https://github.com/OldFamilyRecipe/ai

FROM node:22-alpine

# OCI metadata — discoverable by registries and automated catalogs (e.g. Glama).
LABEL org.opencontainers.image.title="@oldfamilyrecipe/mcp-server" \
      org.opencontainers.image.description="Official MCP server for Old Family Recipe — let Claude, ChatGPT, Cursor and any MCP-compatible AI assistant save, search, and preserve family recipes (with provenance) in your cookbook." \
      org.opencontainers.image.source="https://github.com/OldFamilyRecipe/ai" \
      org.opencontainers.image.url="https://oldfamilyrecipe.ai" \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.vendor="Old Family Recipe"

# Pin the published version. Bump per release; rebuild with:
#   docker build --build-arg OFR_MCP_VERSION=0.3.2 .
ARG OFR_MCP_VERSION=0.3.1

RUN npm install -g @oldfamilyrecipe/mcp-server@${OFR_MCP_VERSION} \
    && npm cache clean --force

# Containers have no browser, so the PKCE+localhost first-run flow can't
# complete. Force RFC 8628 device-code flow instead — the CLI prints a short
# user code + URL to stderr and polls until the user approves on any other
# machine. See mcp-server/src/auth-resolve.ts for the precedence chain.
ENV OFR_NO_BROWSER=1

# OFR_API_KEY is intentionally NOT defaulted here. Pass at runtime:
#
#   docker run -i -e OFR_API_KEY=ofr_xxx oldfamilyrecipe/mcp-server
#
# Without it, the server starts gracefully (tool calls return a friendly
# onboarding message) so introspection-style health checks still pass.

# Drop privileges to the non-root `node` user shipped with the base image.
USER node
WORKDIR /home/node

ENTRYPOINT ["oldfamilyrecipe-mcp"]

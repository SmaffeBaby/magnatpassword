FROM ollama/ollama:0.40.16@sha256:910d0d8107b538fb0894e63163eb195de0cc7aefcbc666dc62d3b18f71124592 AS upstream

FROM ubuntu:24.04
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates libstdc++6 \
    && rm -rf /var/lib/apt/lists/*

COPY --from=upstream /usr/bin/ollama /usr/bin/ollama
# This pinned release keeps CPU libraries, executables and licenses at the root.
# GPU backends and development headers live in subdirectories.
RUN --mount=from=upstream,source=/usr/lib/ollama,target=/upstream \
    install -d /usr/lib/ollama \
    && find /upstream -maxdepth 1 \( -type f -o -type l \) -exec cp -a -t /usr/lib/ollama/ {} +

ENV OLLAMA_HOST=0.0.0.0:11434
EXPOSE 11434
ENTRYPOINT ["/usr/bin/ollama"]
CMD ["serve"]

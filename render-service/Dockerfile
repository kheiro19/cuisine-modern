# CPU-by-default image; on a GPU host, run the same server with the host's Blender (see README) —
# Ubuntu's Blender uses CUDA/OptiX when the NVIDIA driver + toolkit are present on the host.
FROM ubuntu:24.04
RUN apt-get update && apt-get install -y --no-install-recommends blender python3 ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /srv
COPY blender_render.py server.py ./
ENV PORT=8787
EXPOSE 8787
CMD ["python3", "server.py"]

# Official Debian base; pin the resolved digest with --build-arg for a reproducible build.
ARG DEBIAN_BASE=debian:bookworm-slim@sha256:99c0b25c46d0214d5a2091092e7908907dcaecd6a962cde0ac700acee222b6f3
FROM ${DEBIAN_BASE}
LABEL org.sm-techno.document-converter="v1"
RUN apt-get update && apt-get install -y --no-install-recommends libreoffice-writer libreoffice-calc fonts-dejavu-core python3 \
    && mkdir -p /opt/converter /input /output \
    && dpkg-query -W > /opt/converter/packages.txt \
    && rm -rf /var/lib/apt/lists/*
COPY convert.py /opt/converter/convert.py
USER 65534:65534
ENV HOME=/tmp/profile SAL_USE_VCLPLUGIN=svp
ENTRYPOINT ["/usr/bin/python3", "/opt/converter/convert.py"]

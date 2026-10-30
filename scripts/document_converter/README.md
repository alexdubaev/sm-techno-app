# Isolated Office converter

Build only this task-owned image from this directory:

    docker build --pull -t sm-techno-document-converter:v1 scripts/document_converter

Set `DOCUMENT_ASSISTANT_CONVERTER_IMAGE` to its immutable `sha256:...` image ID.
The application never builds or pulls images and never mounts a Docker socket.
Docker must already be available to the backend host. Only a new private directory
containing one selected input and a separate output directory are mounted. The
fixed adapter runs uid 65534, read-only root/input, no network, dropped capabilities,
no new privileges, bounded tmpfs, pids, CPU, memory, output size and timeout.
It removes only its own UUID-named and labelled container after validating ownership.
No desktop Office installation is used. A missing image/daemon is an explicit
unavailable-converter error; there is no unsafe fallback.

Provenance: [official Debian image](https://hub.docker.com/_/debian), signed Debian
APT repositories with package checksums, [LibreOffice MPL 2.0 and included licenses](https://www.libreoffice.org/licenses/).
Installed package/version inventory is `/opt/converter/packages.txt`; distro copyright
files are retained under `/usr/share/doc`. Fonts are Debian's DejaVu package.
[LibreOffice command flags](https://help.libreoffice.org/latest/en-US/text/shared/guide/start_parameters.html)
and [Docker limits](https://docs.docker.com/engine/containers/resource_constraints/) describe the underlying boundaries.
Record base digest and resulting image ID with the local smoke evidence. Rebuild
for security maintenance rather than silently pulling a mutable image at runtime.

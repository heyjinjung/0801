FROM mcr.microsoft.com/playwright/python:latest

WORKDIR /workspace

# Copy minimal ci requirements and install (includes playwright)
COPY ci/playwright/requirements-ci.txt /workspace/requirements-ci.txt
RUN pip install --no-cache-dir -r /workspace/requirements-ci.txt

COPY . /workspace

# Create a runtime wrapper that normalizes CRLF and executes the runner with bash
RUN printf '#!/usr/bin/env bash\nset -e\nif [ -f /workspace/ci/playwright/run_e2e.sh ]; then sed -i '\''s/\r$//'\'' /workspace/ci/playwright/run_e2e.sh || true; fi\nexec bash /workspace/ci/playwright/run_e2e.sh\n' > /usr/local/bin/run-e2e \
	&& chmod +x /usr/local/bin/run-e2e

ENTRYPOINT ["/usr/local/bin/run-e2e"]

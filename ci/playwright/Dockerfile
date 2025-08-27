FROM mcr.microsoft.com/playwright/python:latest

WORKDIR /workspace

# Copy minimal ci requirements and install (includes playwright)
COPY ci/playwright/requirements-ci.txt /workspace/requirements-ci.txt
RUN pip install --no-cache-dir -r /workspace/requirements-ci.txt

COPY . /workspace

ENTRYPOINT ["bash", "ci/playwright/run_e2e.sh"]

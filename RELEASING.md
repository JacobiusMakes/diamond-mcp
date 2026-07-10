# Releasing diamond-mcp

How a new version goes to PyPI. Pure stdlib package, so the build is quick and there
are no compiled artifacts. No em dashes anywhere in this file by house style.

## One time setup

1. Create a PyPI account at https://pypi.org/account/register/ and verify the email.
2. Turn on two factor authentication (PyPI requires it to upload).
3. Create an API token at https://pypi.org/manage/account/token/. For the very first
   upload of a brand new project, scope it to "Entire account" (the project does not
   exist on PyPI yet, so a project scoped token cannot be made until after upload).
   After the first release, create a new token scoped to just the diamond-mcp project
   and delete the account wide one.

The token looks like `pypi-AgEIcHl...`. Treat it like a password: never commit it,
never paste it into a file in this repo.

## Cutting a release

1. Bump the version in `pyproject.toml` (and add a `CHANGELOG.md` entry).
2. Build fresh artifacts:
   ```
   python -m pip install --upgrade build twine
   python -m build
   ```
   This writes `dist/diamond_mcp-<version>-py3-none-any.whl` and the matching `.tar.gz`.
3. Validate:
   ```
   python -m twine check dist/*
   ```
   Both files should report PASSED.
4. Optional but recommended, prove the wheel installs cleanly in a throwaway venv and
   the console script runs and finds its data files before you publish.
5. Upload:
   ```
   python -m twine upload dist/*
   ```
   At the username prompt enter `__token__` (literally, with the underscores). At the
   password prompt paste the `pypi-...` token. Using the interactive prompt keeps the
   token out of your shell history.

After it lands, `pip install diamond-mcp` works for anyone, and the project page is at
https://pypi.org/project/diamond-mcp/ .

## Later: hands off releases (optional)

PyPI Trusted Publishing lets a GitHub Actions workflow publish on a tagged release with
no token stored anywhere (it uses short lived OIDC credentials). Worth setting up once
releases become routine; not needed for the first manual publish.

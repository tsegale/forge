"""Interactive API documentation at /api/docs (Swagger UI) and /api/docs/redoc/, beside the
OpenAPI document at /api/docs/openapi.json.

The pages load Swagger UI and Redoc from jsDelivr at exact versions with Subresource Integrity,
so a changed file is refused by the browser. They carry their own Content Security Policy (the
app's policy allows no third-party scripts but Stripe's): only that CDN, no inline script, and
the Swagger UI start-up code is served from here as a file.
"""

from __future__ import annotations

from flask import Flask, Response, redirect, request

DOCS_PATH = "api/docs"

SWAGGER_UI = "https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.33.1"
SWAGGER_CSS_SRI = "sha384-Ov4/wv3j2bmct8cDc5X4ngJZohVPzEmc6uDPH8WeljUxO5vtoykvMEfbu9Vh6RaW"
SWAGGER_JS_SRI = "sha384-ZPehFMQommnnuaZ4rpxgkgTT2DKFVp4hZC/7pLit+9Lek9T1YGSo23eHFbvNkXkw"
REDOC_JS = "https://cdn.jsdelivr.net/npm/redoc@2.5.4/bundles/redoc.standalone.js"
REDOC_JS_SRI = "sha384-w447zOpYfw/1Tv/5AK9NfHTlQIqE3RVR6KY62jCyy9zNDgO64cMwGGP1Fj0zJVf5"

# Inline styles: Swagger UI sets style attributes and Redoc injects style elements at runtime.
# Redoc renders in a web worker created from a blob URL. Neither page needs anything else.
CONTENT_SECURITY_POLICY = "; ".join(
    [
        "default-src 'none'",
        "script-src 'self' https://cdn.jsdelivr.net",
        "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
        # Redoc shows its "powered by" logo from its own CDN: an image, so allowed for images only.
        "img-src 'self' data: https://cdn.jsdelivr.net https://cdn.redoc.ly",
        "font-src 'self' data:",
        "connect-src 'self'",
        "worker-src blob:",
        "base-uri 'none'",
        "form-action 'none'",
        "frame-ancestors 'none'",
    ]
)

# spectree fills {spec_url}; doubled braces are literal.
PAGE_TEMPLATES = {
    "swagger": f"""<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Forge API</title>
    <link rel="stylesheet" href="{SWAGGER_UI}/swagger-ui.css" integrity="{SWAGGER_CSS_SRI}" crossorigin="anonymous">
  </head>
  <body>
    <div id="swagger-ui" data-spec-url="{{spec_url}}"></div>
    <script src="{SWAGGER_UI}/swagger-ui-bundle.js" integrity="{SWAGGER_JS_SRI}" crossorigin="anonymous"></script>
    <script src="/{DOCS_PATH}/swagger-init.js"></script>
  </body>
</html>""",
    "redoc": f"""<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Forge API reference</title>
  </head>
  <body>
    <redoc spec-url="{{spec_url}}"></redoc>
    <script src="{REDOC_JS}" integrity="{REDOC_JS_SRI}" crossorigin="anonymous"></script>
  </body>
</html>""",
}

SWAGGER_INIT = """window.addEventListener('load', function () {
  var root = document.getElementById('swagger-ui');
  window.ui = SwaggerUIBundle({
    url: root.dataset.specUrl,
    domNode: root,
    presets: [SwaggerUIBundle.presets.apis],
    layout: 'BaseLayout',
    deepLinking: true,
    persistAuthorization: false,
  });
});
"""


def init_app(app: Flask) -> None:
    """Register the /api/docs pages (Swagger UI, Redoc, spec) and their docs-only CSP."""

    @app.get(f"/{DOCS_PATH}")
    @app.get(f"/{DOCS_PATH}/")
    def docs_home():
        """/api/docs opens Swagger UI."""
        return redirect(f"/{DOCS_PATH}/swagger/", code=302)

    @app.get(f"/{DOCS_PATH}/swagger-init.js")
    def swagger_init():
        return Response(SWAGGER_INIT, mimetype="text/javascript")

    @app.after_request
    def docs_policy(response: Response) -> Response:
        if request.path == f"/{DOCS_PATH}" or request.path.startswith(f"/{DOCS_PATH}/"):
            response.headers["Content-Security-Policy"] = CONTENT_SECURITY_POLICY
        return response

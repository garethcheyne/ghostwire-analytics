# ghostwire-analytics (Python)

Error reporting for [Ghostwire Analytics](https://github.com/garethcheyne/ghostwire-analytics):
exceptions, crashes, FastAPI/Starlette, Flask/Django and logging. No dependencies; Python 3.9+.

```bash
pip install ghostwire-analytics
```

Errors are grouped with your browser and Node errors under **Errors** in Ghostwire. Errors with a
`user` also show on that user's page, next to their visits and replays.

It **only observes**. It never catches, swallows or changes your exceptions, and reporting never
raises. Reports are sent on a background thread, so your code never waits on the network.

## Set up

Create a server key in the website's settings (**Settings → Errors → Server errors**) and keep it
secret.

```python
import ghostwire

ghostwire.init(
    host="https://analytics.example.com",
    website_id="7d3ecc49-7e12-4672-b092-685c96d2a6d4",
    key=os.environ["GHOSTWIRE_ERROR_KEY"],
    environment="production",
    release=os.environ.get("APP_VERSION"),
)
```

Or set `GHOSTWIRE_HOST`, `GHOSTWIRE_WEBSITE_ID` and `GHOSTWIRE_ERROR_KEY` (optionally
`GHOSTWIRE_ENVIRONMENT` and `GHOSTWIRE_RELEASE`) and call `ghostwire.init()` with no arguments.

`init()` also reports crashes (uncaught exceptions in the main thread and in other threads). The
original traceback still prints and the program still exits as it would have. Pass
`excepthook=False` to turn that off.

### FastAPI, Starlette and other ASGI apps

```python
from ghostwire.asgi import GhostwireMiddleware

app.add_middleware(GhostwireMiddleware, get_user=lambda scope: {"id": scope["state"]["username"]})
```

### Flask, Django and other WSGI apps

```python
from ghostwire.wsgi import GhostwireWSGIMiddleware

app.wsgi_app = GhostwireWSGIMiddleware(app.wsgi_app)
```

Flask and Django turn errors into 500 pages before WSGI middleware sees them, so also report from
your error handler:

```python
@app.errorhandler(Exception)
def on_error(error):
    ghostwire.capture_exception(error, handled=False, user={"id": current_user.username})
    raise error
```

### Errors you handle

```python
try:
    charge(order)
except PaymentError as error:
    ghostwire.capture_exception(error, user={"id": order.username, "email": order.email},
                                tags={"gateway": "stripe"}, extra={"order": order.id})
    show_payment_failed()
```

Inside an `except` block, `ghostwire.capture_exception()` with no argument reports the exception
being handled.

### Logging

```python
from ghostwire.log_handler import GhostwireHandler

logging.getLogger().addHandler(GhostwireHandler())  # ERROR and above
```

`log.exception(...)` is reported with its stack trace; `log.error(...)` as a message.

### Scripts and jobs

Reports are sent in the background. At the end of a short script, `ghostwire.flush()` waits for
them (it's also called automatically when Python exits).

### Scrubbing

Query strings are never sent. To remove anything else, pass `before_send`, which can change a
report or drop it by returning `None`:

```python
def scrub(report):
    report.get("extra", {}).pop("card_number", None)
    return report

ghostwire.init(before_send=scrub)
```

### Releases

Mark a deploy (it shows on the Releases page and the traffic chart):

```python
ghostwire.register_release("2.4.1", environment="production", commit=os.environ.get("GIT_SHA"))
```

## Develop

```bash
python -m unittest discover -s tests
```

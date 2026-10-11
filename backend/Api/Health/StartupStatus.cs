namespace Api.Health;

public enum StartupStep
{
    Migrations,
    Seed,
    UploadUrls
}

/// <summary>
/// Outcome of the start-up steps that are allowed to fail without stopping the API (migrations, seeder, upload-URL
/// normalizer). Start-up stays "soft" on purpose, so this is what makes a failure visible: <c>/health/ready</c> reads it.
/// Only the failure's type name is kept - never the message, stack or anything that could carry a connection string;
/// the full exception goes to the log at Error level.
/// </summary>
public sealed class StartupStatus
{
    private readonly object _gate = new();
    private readonly Dictionary<StartupStep, StepResult> _results = new();

    private sealed record StepResult(bool Ok, DateTimeOffset At, string? ErrorType);

    public bool IsOk(StartupStep step)
    {
        lock (_gate)
        {
            // A step that has not run (e.g. the normalizer without Uploads:PublicBaseUrl) is not a failure.
            return !_results.TryGetValue(step, out var result) || result.Ok;
        }
    }

    public bool IsReady
    {
        get
        {
            lock (_gate)
            {
                return _results.Values.All(r => r.Ok);
            }
        }
    }

    public string? ErrorType(StartupStep step)
    {
        lock (_gate)
        {
            return _results.TryGetValue(step, out var result) ? result.ErrorType : null;
        }
    }

    public DateTimeOffset? RecordedAt(StartupStep step)
    {
        lock (_gate)
        {
            return _results.TryGetValue(step, out var result) ? result.At : null;
        }
    }

    public void RecordSuccess(StartupStep step)
    {
        lock (_gate)
        {
            _results[step] = new StepResult(true, DateTimeOffset.UtcNow, null);
        }
    }

    public void RecordFailure(StartupStep step, Exception exception)
    {
        lock (_gate)
        {
            _results[step] = new StepResult(false, DateTimeOffset.UtcNow, exception.GetType().Name);
        }
    }

    /// <summary>
    /// Runs one start-up step: success or failure is recorded, a failure is logged in full (Error) and swallowed,
    /// so the application keeps starting exactly as before.
    /// </summary>
    public async Task RunAsync(
        StartupStep step,
        Func<Task> action,
        Microsoft.Extensions.Logging.ILogger logger,
        string failureMessage)
    {
        try
        {
            await action();
            RecordSuccess(step);
        }
        catch (Exception ex)
        {
            RecordFailure(step, ex);
            logger.LogError(ex, "{Message}", failureMessage);
        }
    }
}

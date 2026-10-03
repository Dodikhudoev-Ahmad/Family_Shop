using Application.Services;
using Domain.Interfaces;

namespace Api.Background;

/// <summary>Removes saved idempotency responses older than their 24 h lifetime (hourly). Expired rows are ignored by lookups
/// and replaced on reuse anyway, so this only keeps the table small.</summary>
public class IdempotencyKeyCleanupService : BackgroundService
{
    private static readonly TimeSpan Interval = TimeSpan.FromHours(1);

    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<IdempotencyKeyCleanupService> _logger;

    public IdempotencyKeyCleanupService(IServiceScopeFactory scopeFactory, ILogger<IdempotencyKeyCleanupService> logger)
    {
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(Interval);
        do
        {
            await RunOnceAsync(stoppingToken);
        }
        while (await WaitAsync(timer, stoppingToken));
    }

    public async Task<int> RunOnceAsync(CancellationToken cancellationToken)
    {
        try
        {
            using var scope = _scopeFactory.CreateScope();
            var unitOfWork = scope.ServiceProvider.GetRequiredService<IUnitOfWork>();
            var removed = await unitOfWork.IdempotencyKeys.DeleteOlderThanAsync(DateTime.UtcNow - OrderService.IdempotencyKeyLifetime, cancellationToken);
            if (removed > 0)
            {
                _logger.LogInformation("Removed {Count} expired idempotency keys.", removed);
            }

            return removed;
        }
        catch (OperationCanceledException)
        {
            return 0;
        }
        catch (Exception ex)
        {
            // A failed cleanup must never take the API down; the next tick tries again.
            _logger.LogWarning(ex, "Idempotency key cleanup failed.");
            return 0;
        }
    }

    private static async Task<bool> WaitAsync(PeriodicTimer timer, CancellationToken cancellationToken)
    {
        try
        {
            return await timer.WaitForNextTickAsync(cancellationToken);
        }
        catch (OperationCanceledException)
        {
            return false;
        }
    }
}

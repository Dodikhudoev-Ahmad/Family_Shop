using Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Api.Health;

/// <summary>Database reachability check behind <c>/health</c>; an interface so the endpoints can be tested without a database.</summary>
public interface IDatabaseProbe
{
    Task<bool> CanConnectAsync(CancellationToken cancellationToken);
}

public sealed class DbContextProbe(AppDbContext db) : IDatabaseProbe
{
    public Task<bool> CanConnectAsync(CancellationToken cancellationToken) => db.Database.CanConnectAsync(cancellationToken);
}

public static class HealthEndpoints
{
    /// <summary>
    /// <c>/health</c> - liveness: only that the database is reachable (the platform health check, must not flip on a
    /// failed migration or the restart loop / 502 returns). <c>/health/ready</c> - whether start-up finished cleanly,
    /// from memory, no database call; for an external monitor. Both anonymous; the body never carries error text.
    /// </summary>
    public static IEndpointRouteBuilder MapFamilyShopHealth(this IEndpointRouteBuilder endpoints)
    {
        endpoints.MapGet("/health", async (IDatabaseProbe probe, CancellationToken cancellationToken) =>
        {
            var healthy = await probe.CanConnectAsync(cancellationToken);
            return healthy
                ? Results.Ok(new { status = "healthy" })
                : Results.Json(new { status = "unhealthy" }, statusCode: StatusCodes.Status503ServiceUnavailable);
        }).AllowAnonymous();

        endpoints.MapGet("/health/ready", (StartupStatus status) =>
        {
            if (status.IsReady)
            {
                return Results.Ok(new { status = "ready" });
            }

            static string Word(bool ok) => ok ? "ok" : "failed";
            var body = new Dictionary<string, string>
            {
                ["status"] = "degraded",
                ["migrations"] = Word(status.IsOk(StartupStep.Migrations)),
                ["seed"] = Word(status.IsOk(StartupStep.Seed)),
            };
            if (!status.IsOk(StartupStep.UploadUrls))
            {
                body["uploadUrls"] = "failed";
            }

            return Results.Json(body, statusCode: StatusCodes.Status503ServiceUnavailable);
        }).AllowAnonymous();

        return endpoints;
    }
}

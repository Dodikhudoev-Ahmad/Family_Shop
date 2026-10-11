using Api.Health;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Routing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;
using NSubstitute;
using Xunit;

namespace Application.Tests.Security;

public class HealthEndpointsTests
{
    private const string SecretLookingMessage = "Host=db.internal;Database=familyshop;LEAK-MARKER-42";

    private static async Task<WebApplication> StartAsync(StartupStatus status, bool databaseUp = true)
    {
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        builder.Configuration["AllowedHosts"] = "*"; // host filtering is not what is under test
        builder.Services.AddSingleton(status);
        var probe = Substitute.For<IDatabaseProbe>();
        probe.CanConnectAsync(Arg.Any<CancellationToken>()).Returns(databaseUp);
        builder.Services.AddSingleton(probe);
        // the same closed-by-default policy the real API has (a scheme is registered only so the middleware can run)
        builder.Services.AddAuthentication().AddJwtBearer();
        builder.Services.AddAuthorization(o => o.FallbackPolicy = new AuthorizationPolicyBuilder().RequireAuthenticatedUser().Build());

        var app = builder.Build();
        app.UseAuthentication();
        app.UseAuthorization();
        app.MapFamilyShopHealth();
        await app.StartAsync();
        return app;
    }

    // ---- StartupStatus ----

    [Fact]
    public void FreshStatus_IsReady()
    {
        var status = new StartupStatus();
        Assert.True(status.IsReady);
        Assert.True(status.IsOk(StartupStep.Migrations));
    }

    [Fact]
    public void RecordedFailure_MakesItNotReady_AndKeepsOnlyTheExceptionTypeName()
    {
        var status = new StartupStatus();
        status.RecordSuccess(StartupStep.Seed);
        status.RecordFailure(StartupStep.Migrations, new InvalidOperationException(SecretLookingMessage));

        Assert.False(status.IsReady);
        Assert.False(status.IsOk(StartupStep.Migrations));
        Assert.True(status.IsOk(StartupStep.Seed));
        Assert.Equal("InvalidOperationException", status.ErrorType(StartupStep.Migrations));
        Assert.NotNull(status.RecordedAt(StartupStep.Migrations));
    }

    [Fact]
    public async Task RunAsync_SwallowsAndLogsFailure_AndRecordsIt()
    {
        var status = new StartupStatus();
        var logger = Substitute.For<ILogger>();

        await status.RunAsync(StartupStep.Migrations, () => throw new InvalidOperationException(SecretLookingMessage), logger, "migration failed");

        Assert.False(status.IsOk(StartupStep.Migrations));
        logger.Received(1).Log(
            LogLevel.Error, Arg.Any<EventId>(), Arg.Any<object>(), Arg.Any<InvalidOperationException>(), Arg.Any<Func<object, Exception?, string>>());
    }

    [Fact]
    public async Task RunAsync_RecordsSuccess_AndALaterSuccessClearsAnEarlierFailure()
    {
        var status = new StartupStatus();
        status.RecordFailure(StartupStep.Seed, new Exception("x"));

        await status.RunAsync(StartupStep.Seed, () => Task.CompletedTask, NullLogger.Instance, "seed failed");

        Assert.True(status.IsReady);
    }

    // ---- endpoints ----

    [Fact]
    public async Task Ready_Is200_WhenStartupWasClean()
    {
        var status = new StartupStatus();
        status.RecordSuccess(StartupStep.Migrations);
        status.RecordSuccess(StartupStep.Seed);
        await using var app = await StartAsync(status);

        var response = await app.GetTestClient().GetAsync("/health/ready");

        Assert.Equal(System.Net.HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("""{"status":"ready"}""", await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task FailedMigration_KeepsLivenessGreen_ButReadinessIs503_WithoutLeakingTheError()
    {
        var status = new StartupStatus();
        await status.RunAsync(StartupStep.Migrations, () => throw new InvalidOperationException(SecretLookingMessage), NullLogger.Instance, "migration failed");
        await status.RunAsync(StartupStep.Seed, () => Task.CompletedTask, NullLogger.Instance, "seed failed");
        await using var app = await StartAsync(status);
        var client = app.GetTestClient();

        var live = await client.GetAsync("/health");
        var ready = await client.GetAsync("/health/ready");
        var body = await ready.Content.ReadAsStringAsync();

        Assert.Equal(System.Net.HttpStatusCode.OK, live.StatusCode);
        Assert.Equal(System.Net.HttpStatusCode.ServiceUnavailable, ready.StatusCode);
        Assert.Equal("""{"status":"degraded","migrations":"failed","seed":"ok"}""", body);
        Assert.DoesNotContain("LEAK-MARKER-42", body);
        Assert.DoesNotContain("InvalidOperationException", body);
    }

    [Fact]
    public async Task FailedUploadUrlNormalization_IsReportedToo()
    {
        var status = new StartupStatus();
        status.RecordSuccess(StartupStep.Migrations);
        status.RecordSuccess(StartupStep.Seed);
        status.RecordFailure(StartupStep.UploadUrls, new Exception("x"));
        await using var app = await StartAsync(status);

        var response = await app.GetTestClient().GetAsync("/health/ready");

        Assert.Equal(System.Net.HttpStatusCode.ServiceUnavailable, response.StatusCode);
        Assert.Contains("\"uploadUrls\":\"failed\"", await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Liveness_StillReports503_WhenTheDatabaseIsDown()
    {
        await using var app = await StartAsync(new StartupStatus(), databaseUp: false);

        var response = await app.GetTestClient().GetAsync("/health");

        Assert.Equal(System.Net.HttpStatusCode.ServiceUnavailable, response.StatusCode);
    }

    [Theory]
    [InlineData("/health")]
    [InlineData("/health/ready")]
    public async Task HealthEndpoints_AreAnonymous_UnderTheClosedByDefaultPolicy(string path)
    {
        await using var app = await StartAsync(new StartupStatus());

        var endpoint = app.Services.GetRequiredService<EndpointDataSource>().Endpoints
            .Single(e => ((RouteEndpoint)e).RoutePattern.RawText == path);
        Assert.NotNull(endpoint.Metadata.GetMetadata<IAllowAnonymous>());

        var response = await app.GetTestClient().GetAsync(path); // no credentials: must not be 401
        Assert.NotEqual(System.Net.HttpStatusCode.Unauthorized, response.StatusCode);
    }
}

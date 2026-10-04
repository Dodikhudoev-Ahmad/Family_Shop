using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using Xunit;
using Infrastructure.Persistence;

namespace Application.Tests.Integration;

/// <summary>
/// A throw-away database on a real PostgreSQL, created from the real migrations and dropped afterwards. The server
/// comes from the <c>TEST_POSTGRES_CONNECTION</c> environment variable or, failing that, from the Api project's
/// user-secrets connection string; only host/port/credentials are taken - the database name is always a fresh
/// <c>familyshop_test_*</c> one, so no existing database (let alone production) is ever touched. If no server is
/// reachable, <see cref="Available"/> is false and the tests marked <see cref="PostgresFactAttribute"/> are skipped.
/// </summary>
public sealed class PostgresFixture : IAsyncLifetime
{
    private const string ApiUserSecretsId = "ea2f73a7-8648-47d6-bdf7-f173e91f03de";

    private static readonly Lazy<(string? Server, string? SkipReason)> Server = new(Probe);

    private string? _connectionString;

    public static string? SkipReason => Server.Value.SkipReason;

    public bool Available => _connectionString is not null;

    public AppDbContext CreateContext() =>
        new(new DbContextOptionsBuilder<AppDbContext>().UseNpgsql(_connectionString).Options);

    public async Task InitializeAsync()
    {
        if (Server.Value.Server is null)
        {
            return;
        }

        var builder = new NpgsqlConnectionStringBuilder(Server.Value.Server)
        {
            Database = $"familyshop_test_{Guid.NewGuid():N}",
            Pooling = true,
            MaxPoolSize = 100
        };

        await using var context = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>().UseNpgsql(builder.ConnectionString).Options);
        await context.Database.MigrateAsync(); // creates the database, then applies every migration
        _connectionString = builder.ConnectionString;
    }

    public async Task DisposeAsync()
    {
        if (_connectionString is null)
        {
            return;
        }

        await using var context = CreateContext();
        await context.Database.EnsureDeletedAsync();
        NpgsqlConnection.ClearAllPools();
    }

    private static (string? Server, string? SkipReason) Probe()
    {
        var template = ReadServerConnectionString();
        if (template is null)
        {
            return (null, "No PostgreSQL connection (set TEST_POSTGRES_CONNECTION or the Api user-secret).");
        }

        try
        {
            // Connect to the server's maintenance database only to check that it is reachable.
            var probe = new NpgsqlConnectionStringBuilder(template) { Database = "postgres", Timeout = 3, Pooling = false };
            using var connection = new NpgsqlConnection(probe.ConnectionString);
            connection.Open();
            return (template, null);
        }
        catch (Exception ex) when (ex is NpgsqlException or System.Net.Sockets.SocketException or TimeoutException)
        {
            return (null, $"PostgreSQL is not reachable: {ex.Message}");
        }
    }

    private static string? ReadServerConnectionString()
    {
        var fromEnv = Environment.GetEnvironmentVariable("TEST_POSTGRES_CONNECTION");
        if (!string.IsNullOrWhiteSpace(fromEnv))
        {
            return fromEnv;
        }

        var secretsPath = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
            ".microsoft", "usersecrets", ApiUserSecretsId, "secrets.json");
        if (!File.Exists(secretsPath))
        {
            return null;
        }

        using var doc = JsonDocument.Parse(File.ReadAllText(secretsPath), new JsonDocumentOptions { CommentHandling = JsonCommentHandling.Skip });
        return doc.RootElement.TryGetProperty("ConnectionStrings:DefaultConnection", out var value) ? value.GetString() : null;
    }
}

/// <summary>[Fact] that is skipped (not failed) on machines without a reachable PostgreSQL, e.g. plain CI.</summary>
public sealed class PostgresFactAttribute : FactAttribute
{
    public PostgresFactAttribute()
    {
        Skip = PostgresFixture.SkipReason;
    }
}

/// <summary>[Theory] that is skipped (not failed) on machines without a reachable PostgreSQL.</summary>
public sealed class PostgresTheoryAttribute : TheoryAttribute
{
    public PostgresTheoryAttribute()
    {
        Skip = PostgresFixture.SkipReason;
    }
}

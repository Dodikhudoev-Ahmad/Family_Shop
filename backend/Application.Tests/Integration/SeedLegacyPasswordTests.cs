using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;
using Domain.Entities;
using Domain.ValueObjects;
using Infrastructure.Persistence;
using Infrastructure.Security;

namespace Application.Tests.Integration;

/// <summary>
/// The retired demo-reviewer password is no longer in the code: it arrives from configuration
/// (<c>Seed:LegacyReviewerPassword</c>, i.e. the <c>Seed__LegacyReviewerPassword</c> variable) and is replaced by a random one.
/// </summary>
public class SeedLegacyPasswordTests : IClassFixture<PostgresFixture>
{
    // A made-up value for the test only: it is not, and never was, a password of any real account.
    private const string LegacyPassword = "Legacy-Test-Pw-1";

    private readonly PostgresFixture _db;
    private readonly BCryptPasswordHasher _hasher = new();

    public SeedLegacyPasswordTests(PostgresFixture db) => _db = db;

    private async Task SeedAsync(string? legacyPassword)
    {
        var values = new Dictionary<string, string?>();
        if (legacyPassword is not null)
        {
            values["Seed:LegacyReviewerPassword"] = legacyPassword;
        }

        var config = new ConfigurationBuilder().AddInMemoryCollection(values).Build();
        await using var ctx = _db.CreateContext();
        await SeedData.SeedAsync(ctx, _hasher, config, NullLogger.Instance, isDevelopment: true);
    }

    private async Task<(int UserId, string KnownHash)> MakeReviewerKnownAsync()
    {
        await using var ctx = _db.CreateContext();
        // The Email value object can't be pattern-matched in SQL through LINQ - pick the demo reviewer in memory.
        var reviewer = (await ctx.Users.ToListAsync()).First(u => u.Email.Value.EndsWith("@seed.familyshop.kz"));
        reviewer.PasswordHash = _hasher.Hash(LegacyPassword);
        await ctx.SaveChangesAsync();
        return (reviewer.Id, reviewer.PasswordHash);
    }

    [PostgresFact]
    public async Task WithTheVariable_AKnownReviewerPasswordIsReplacedWithARandomOne_AndOtherDataStays()
    {
        await SeedAsync(null);
        var (userId, knownHash) = await MakeReviewerKnownAsync();
        int reviewsBefore;
        await using (var ctx = _db.CreateContext())
        {
            reviewsBefore = await ctx.Reviews.CountAsync();
        }

        await SeedAsync(LegacyPassword);
        await SeedAsync(LegacyPassword); // and again: the seeder runs on every deploy

        await using var after = _db.CreateContext();
        var user = await after.Users.AsNoTracking().SingleAsync(u => u.Id == userId);
        Assert.NotEqual(knownHash, user.PasswordHash);
        Assert.False(_hasher.Verify(LegacyPassword, user.PasswordHash));
        Assert.Equal(reviewsBefore, await after.Reviews.CountAsync()); // FK-linked rows untouched
    }

    [PostgresFact]
    public async Task WithoutTheVariable_NothingIsChanged()
    {
        await SeedAsync(null);
        var (userId, knownHash) = await MakeReviewerKnownAsync();

        await SeedAsync(null);
        await SeedAsync("");

        await using var after = _db.CreateContext();
        var user = await after.Users.AsNoTracking().SingleAsync(u => u.Id == userId);
        Assert.Equal(knownHash, user.PasswordHash);
    }

    [PostgresFact]
    public async Task AnotherUserWithTheSamePassword_IsNotTouched()
    {
        await SeedAsync(null);
        var hash = _hasher.Hash(LegacyPassword);
        int customerId;
        await using (var ctx = _db.CreateContext())
        {
            var customer = new User
            {
                Email = new Email("real.customer@example.com"),
                Name = "Real",
                PasswordHash = hash,
                Role = UserRole.Customer
            };
            ctx.Users.Add(customer);
            await ctx.SaveChangesAsync();
            customerId = customer.Id;
        }

        await SeedAsync(LegacyPassword);

        await using var after = _db.CreateContext();
        Assert.Equal(hash, (await after.Users.AsNoTracking().SingleAsync(u => u.Id == customerId)).PasswordHash);
    }
}

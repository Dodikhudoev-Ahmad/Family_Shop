using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using NSubstitute;
using Xunit;
using Application.Common;
using Application.Interfaces;
using Application.Services;
using Application.Tests.Services;
using Domain.Entities;
using Domain.Interfaces;
using Domain.ValueObjects;
using Infrastructure.Persistence;
using Infrastructure.Persistence.Migrations;
using Infrastructure.Persistence.Repositories;

namespace Application.Tests.Integration;

/// <summary>E-mail confirmation and password reset against a real PostgreSQL: the migration, the single-use guarantee under
/// real concurrency, and the end of every session after a reset.</summary>
public class EmailTokensTests : IClassFixture<PostgresFixture>
{
    private static readonly SeoSettings Site = new("https://www.familyshop10.kz", null, 60);

    private readonly PostgresFixture _db;

    public EmailTokensTests(PostgresFixture db) => _db = db;

    private async Task<int> NewUserAsync(string? passwordHash = "old-hash")
    {
        await using var ctx = _db.CreateContext();
        var user = new User { Email = new Email($"u{Guid.NewGuid():N}@example.com"), Name = "Test", PasswordHash = passwordHash! };
        ctx.Add(user);
        await ctx.SaveChangesAsync();
        return user.Id;
    }

    private static IPasswordHasher Hasher()
    {
        var hasher = Substitute.For<IPasswordHasher>();
        hasher.Hash(Arg.Any<string>()).Returns(call => "hash-of-" + call.Arg<string>());
        return hasher;
    }

    private AccountEmailService Service(AppDbContext ctx, IEmailSender sender, IEmailRequestThrottle? throttle = null) =>
        new(new UnitOfWork(ctx), sender, Hasher(), new LoginAttemptTracker(), throttle ?? new EmailRequestThrottle(), Site,
            NullLogger<AccountEmailService>.Instance, null, TimeSpan.Zero);

    private static string TokenFrom(EmailMessage message) =>
        Regex.Match(message.TextBody, @"#token=([A-Za-z0-9_-]+)").Groups[1].Value;

    private async Task<(string Email, string Token)> RequestAsync(int userId, bool reset)
    {
        var sender = new CapturingEmailSender();
        await using var ctx = _db.CreateContext();
        var email = (await ctx.Users.AsNoTracking().SingleAsync(u => u.Id == userId)).Email.Value;
        var service = Service(ctx, sender);
        if (reset)
        {
            await service.RequestPasswordResetAsync(email, "ru");
        }
        else
        {
            await service.RequestConfirmationAsync(email, "ru");
        }

        return (email, TokenFrom(Assert.Single(sender.Sent)));
    }

    // ---- migration ----

    [PostgresFact]
    public async Task TheMigration_RunsAgain_WithoutChangingAnything_AndLeavesExistingUsersUnconfirmed()
    {
        var userId = await NewUserAsync();
        var (_, token) = await RequestAsync(userId, reset: true);

        await using (var ctx = _db.CreateContext())
        {
            await ctx.Database.ExecuteSqlRawAsync(EmailTokensSql.Up);
            await ctx.Database.ExecuteSqlRawAsync(EmailTokensSql.Up);
        }

        await using var check = _db.CreateContext();
        Assert.Null((await check.Users.AsNoTracking().SingleAsync(u => u.Id == userId)).EmailConfirmedAt);
        Assert.Equal(1, await check.EmailTokens.CountAsync(t => t.UserId == userId));
        Assert.Equal(EmailTokenPurpose.Reset, (await check.EmailTokens.SingleAsync(t => t.UserId == userId)).Purpose);
        Assert.False(string.IsNullOrEmpty(token));
    }

    [PostgresFact]
    public async Task ThePlainTokenIsNeverInTheDatabase()
    {
        var userId = await NewUserAsync();
        var (_, token) = await RequestAsync(userId, reset: true);

        await using var ctx = _db.CreateContext();
        var row = await ctx.EmailTokens.AsNoTracking().SingleAsync(t => t.UserId == userId);
        Assert.Equal(TokenHasher.Hash(token), row.TokenHash);
        Assert.NotEqual(token, row.TokenHash);
        Assert.Equal(64, row.TokenHash.Length);
    }

    // ---- concurrency ----

    [PostgresFact]
    public async Task ManySimultaneousResets_OfOneToken_ExactlyOneWins()
    {
        var userId = await NewUserAsync();
        var (_, token) = await RequestAsync(userId, reset: true);

        var outcomes = await Task.WhenAll(Enumerable.Range(0, 16).Select(i => Task.Run(async () =>
        {
            await using var ctx = _db.CreateContext();
            return await Service(ctx, new CapturingEmailSender()).ResetPasswordAsync(token, $"Brand-new-pw{i}");
        })));

        Assert.Equal(1, outcomes.Count(o => o == ResetPasswordOutcome.Reset));
        Assert.Equal(15, outcomes.Count(o => o == ResetPasswordOutcome.InvalidToken));
        await using var check = _db.CreateContext();
        Assert.StartsWith("hash-of-Brand-new-pw", (await check.Users.AsNoTracking().SingleAsync(u => u.Id == userId)).PasswordHash);
    }

    [PostgresFact]
    public async Task ManySimultaneousConfirmations_OfOneToken_ExactlyOneWins()
    {
        var userId = await NewUserAsync();
        var (_, token) = await RequestAsync(userId, reset: false);

        var outcomes = await Task.WhenAll(Enumerable.Range(0, 16).Select(_ => Task.Run(async () =>
        {
            await using var ctx = _db.CreateContext();
            return await Service(ctx, new CapturingEmailSender()).ConfirmEmailAsync(token);
        })));

        Assert.Equal(1, outcomes.Count(o => o == ConfirmEmailOutcome.Confirmed));
        await using var check = _db.CreateContext();
        Assert.NotNull((await check.Users.AsNoTracking().SingleAsync(u => u.Id == userId)).EmailConfirmedAt);
    }

    [PostgresFact]
    public async Task AnExpiredToken_IsRefused_ByTheRealQuery()
    {
        var userId = await NewUserAsync();
        var (_, token) = await RequestAsync(userId, reset: true);
        await using (var ctx = _db.CreateContext())
        {
            await ctx.EmailTokens.Where(t => t.UserId == userId).ExecuteUpdateAsync(s => s.SetProperty(t => t.ExpiresAt, DateTime.UtcNow.AddMinutes(-1)));
        }

        await using var service = _db.CreateContext();
        Assert.Equal(ResetPasswordOutcome.InvalidToken, await Service(service, new CapturingEmailSender()).ResetPasswordAsync(token, "Brand-new-pw1"));
        await using var check = _db.CreateContext();
        Assert.Equal("old-hash", (await check.Users.AsNoTracking().SingleAsync(u => u.Id == userId)).PasswordHash);
    }

    // ---- sessions ----

    [PostgresFact]
    public async Task AfterAReset_EveryWebAndMobileSessionIsDead_AndTheNewPasswordIsStored()
    {
        var userId = await NewUserAsync();
        var webFamily = Guid.NewGuid();
        var mobileFamily = Guid.NewGuid();
        await using (var ctx = _db.CreateContext())
        {
            var now = DateTime.UtcNow;
            ctx.RefreshTokens.Add(new RefreshToken { UserId = userId, TokenHash = $"w{Guid.NewGuid():N}", FamilyId = webFamily, ClientType = ClientType.Web, ExpiresAt = now.AddDays(1), AbsoluteExpiresAt = now.AddDays(9) });
            ctx.RefreshTokens.Add(new RefreshToken { UserId = userId, TokenHash = $"m{Guid.NewGuid():N}", FamilyId = mobileFamily, ClientType = ClientType.Mobile, DeviceIdHash = "d", ExpiresAt = now.AddDays(1), AbsoluteExpiresAt = now.AddDays(9) });
            await ctx.SaveChangesAsync();
        }

        var (_, token) = await RequestAsync(userId, reset: true);
        await using (var ctx = _db.CreateContext())
        {
            Assert.Equal(ResetPasswordOutcome.Reset, await Service(ctx, new CapturingEmailSender()).ResetPasswordAsync(token, "Brand-new-pw1"));
        }

        await using var check = _db.CreateContext();
        var tokens = new RefreshTokenRepository(check);
        var now2 = DateTime.UtcNow;
        Assert.False(await tokens.IsSessionActiveAsync(userId, webFamily, now2));     // what the access-token check asks
        Assert.False(await tokens.IsSessionActiveAsync(userId, mobileFamily, now2));
        var user = await check.Users.AsNoTracking().SingleAsync(u => u.Id == userId);
        Assert.Equal("hash-of-Brand-new-pw1", user.PasswordHash);
        Assert.NotNull(user.EmailConfirmedAt);
    }

    [PostgresFact]
    public async Task ARefusedPassword_LeavesSessionsAndPasswordAlone()
    {
        var userId = await NewUserAsync();
        var family = Guid.NewGuid();
        await using (var ctx = _db.CreateContext())
        {
            var now = DateTime.UtcNow;
            ctx.RefreshTokens.Add(new RefreshToken { UserId = userId, TokenHash = $"w{Guid.NewGuid():N}", FamilyId = family, ExpiresAt = now.AddDays(1), AbsoluteExpiresAt = now.AddDays(9) });
            await ctx.SaveChangesAsync();
        }

        var (email, token) = await RequestAsync(userId, reset: true);
        await using (var ctx = _db.CreateContext())
        {
            Assert.Equal(ResetPasswordOutcome.NotAllowed, await Service(ctx, new CapturingEmailSender()).ResetPasswordAsync(token, email));
        }

        await using var check = _db.CreateContext();
        Assert.True(await new RefreshTokenRepository(check).IsSessionActiveAsync(userId, family, DateTime.UtcNow));
        Assert.Equal("old-hash", (await check.Users.AsNoTracking().SingleAsync(u => u.Id == userId)).PasswordHash);
        Assert.Null((await check.EmailTokens.AsNoTracking().SingleAsync(t => t.UserId == userId)).UsedAt); // link still usable
    }

    // ---- account deletion ----

    [PostgresFact]
    public async Task DeletingTheAccount_RemovesItsEmailTokens()
    {
        var userId = await NewUserAsync();
        await RequestAsync(userId, reset: true);
        await RequestAsync(userId, reset: false);
        await using (var ctx = _db.CreateContext())
        {
            var hasher = Substitute.For<IPasswordHasher>();
            hasher.Verify(Arg.Any<string>(), Arg.Any<string>()).Returns(true);
            var auth = new AuthService(new UnitOfWork(ctx), hasher, Substitute.For<IJwtTokenGenerator>(), NullLogger<AuthService>.Instance);
            Assert.Equal(DeleteAccountOutcome.Deleted, await auth.DeleteAccountAsync(userId, "pw"));
        }

        await using var check = _db.CreateContext();
        Assert.Equal(0, await check.EmailTokens.CountAsync(t => t.UserId == userId));
    }

    [PostgresFact]
    public async Task ANewRequest_ReplacesTheUnusedToken_InTheDatabase()
    {
        var userId = await NewUserAsync();
        var (_, first) = await RequestAsync(userId, reset: true);
        var (_, second) = await RequestAsync(userId, reset: true);

        await using var ctx = _db.CreateContext();
        Assert.Equal(1, await ctx.EmailTokens.CountAsync(t => t.UserId == userId));
        Assert.Equal(ResetPasswordOutcome.InvalidToken, await Service(ctx, new CapturingEmailSender()).ResetPasswordAsync(first, "Brand-new-pw1"));
        Assert.Equal(ResetPasswordOutcome.Reset, await Service(ctx, new CapturingEmailSender()).ResetPasswordAsync(second, "Brand-new-pw1"));
    }
}

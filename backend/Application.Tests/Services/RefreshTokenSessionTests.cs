using Microsoft.Extensions.Logging.Abstractions;
using NSubstitute;
using Xunit;
using Application.Common;
using Application.Interfaces;
using Application.Services;
using Application.Tests.Fakes;
using Domain.Entities;
using Domain.Interfaces;
using Domain.ValueObjects;

namespace Application.Tests.Services;

/// <summary>Refresh-token rotation, replay detection, device binding, lifetimes and revocation.</summary>
public class RefreshTokenSessionTests
{
    private const string Device = "11111111-2222-3333-4444-555555555555";
    private const string OtherDevice = "99999999-8888-7777-6666-555555555555";

    private readonly FakeRefreshTokenRepository _repo = new();
    private readonly IUnitOfWork _unitOfWork = Substitute.For<IUnitOfWork>();
    private readonly IUserRepository _users = Substitute.For<IUserRepository>();
    private readonly IPasswordHasher _hasher = Substitute.For<IPasswordHasher>();
    private readonly IJwtTokenGenerator _jwt = Substitute.For<IJwtTokenGenerator>();
    private readonly AuthService _sut;
    private int _counter;

    private readonly User _alice = new() { Id = 1, Email = new Email("alice@example.com"), Name = "Alice", PasswordHash = "h-alice" };
    private readonly User _bob = new() { Id = 2, Email = new Email("bob@example.com"), Name = "Bob", PasswordHash = "h-bob" };

    private static readonly SessionContext MobileDevice = new(ClientType.Mobile, Device, "Pixel 8");

    public RefreshTokenSessionTests()
    {
        _unitOfWork.Users.Returns(_users);
        _unitOfWork.RefreshTokens.Returns(_repo);
        _repo.RegisterUser(_alice);
        _repo.RegisterUser(_bob);
        _users.GetByEmailAsync("alice@example.com", Arg.Any<CancellationToken>()).Returns(_alice);
        _users.GetByEmailAsync("bob@example.com", Arg.Any<CancellationToken>()).Returns(_bob);
        _hasher.Verify(Arg.Any<string>(), Arg.Any<string>()).Returns(true);
        _jwt.GenerateAccessToken(Arg.Any<User>(), Arg.Any<Guid>()).Returns("access");
        _jwt.GenerateRefreshToken().Returns(_ => $"rt-{++_counter}");
        _sut = new AuthService(_unitOfWork, _hasher, _jwt, NullLogger<AuthService>.Instance);
    }

    private async Task<string> LoginAsync(string email, SessionContext session)
    {
        var result = await _sut.LoginAsync(new(email, "pw"), session);
        Assert.True(result.IsSuccess);
        return result.Value!.RefreshToken;
    }

    private static string Hash(string token) => TokenHasher.Hash(token);
    private RefreshToken Row(string token) => _repo.Tokens.Single(t => t.TokenHash == Hash(token));

    // ---------- rotation ----------

    [Fact]
    public async Task Refresh_RotatesTheToken_TheOldOneStopsWorking()
    {
        var first = await LoginAsync("alice@example.com", SessionContext.Web);

        var rotated = await _sut.RefreshAsync(first, SessionContext.Web);

        Assert.True(rotated.IsSuccess);
        Assert.NotEqual(first, rotated.Value!.RefreshToken);
        Assert.NotNull(Row(first).RotatedAt);
        Assert.Equal(Row(first).FamilyId, Row(rotated.Value.RefreshToken).FamilyId); // same session family

        // Using the old token again (after the benign-race window) fails...
        Row(first).RotatedAt = DateTime.UtcNow.AddMinutes(-5);
        Assert.False((await _sut.RefreshAsync(first, SessionContext.Web)).IsSuccess);
    }

    [Fact]
    public async Task ReplayOfARotatedToken_AfterTheGraceWindow_RevokesTheWholeSession_IncludingTheSuccessor()
    {
        // Attack: a thief copies the cookie, the real user refreshes first (token A -> B), the thief
        // replays A. Without family revocation the thief would simply start a parallel chain.
        var a = await LoginAsync("alice@example.com", SessionContext.Web);
        var b = (await _sut.RefreshAsync(a, SessionContext.Web)).Value!.RefreshToken;
        Row(a).RotatedAt = DateTime.UtcNow.AddMinutes(-1);

        var replay = await _sut.RefreshAsync(a, SessionContext.Web);

        Assert.False(replay.IsSuccess);
        Assert.NotNull(Row(b).RevokedAt);
        Assert.False((await _sut.RefreshAsync(b, SessionContext.Web)).IsSuccess); // the legitimate chain is burned too
    }

    [Fact]
    public async Task ReplayWithinTheGraceWindow_IsABenignRace_AndDoesNotKillTheSession()
    {
        // Two browser tabs refreshing at the same instant: the second one loses, but the user stays logged in.
        var a = await LoginAsync("alice@example.com", SessionContext.Web);
        var b = (await _sut.RefreshAsync(a, SessionContext.Web)).Value!.RefreshToken;

        var loser = await _sut.RefreshAsync(a, SessionContext.Web);

        Assert.False(loser.IsSuccess);
        Assert.Null(Row(b).RevokedAt);
        Assert.True((await _sut.RefreshAsync(b, SessionContext.Web)).IsSuccess);
    }

    [Fact]
    public async Task ConcurrentRefreshesWithTheSameToken_ExactlyOneWins()
    {
        var a = await LoginAsync("alice@example.com", SessionContext.Web);

        var results = await Task.WhenAll(Enumerable.Range(0, 12).Select(_ => Task.Run(() => _sut.RefreshAsync(a, SessionContext.Web))));

        Assert.Equal(1, results.Count(r => r.IsSuccess));
        Assert.Equal(2, _repo.Tokens.Count); // the original and exactly one successor
    }

    [Fact]
    public async Task AnUnknownOrGarbageToken_FailsWithTheGenericMessage()
    {
        var result = await _sut.RefreshAsync("not-a-real-token", SessionContext.Web);

        Assert.False(result.IsSuccess);
        Assert.Equal("Invalid or expired refresh token.", Assert.Single(result.Errors));
    }

    // ---------- lifetimes ----------

    [Fact]
    public async Task MobileSessions_UseAShorterLifetime_ThanWeb()
    {
        var web = await LoginAsync("alice@example.com", SessionContext.Web);
        var mobile = await LoginAsync("bob@example.com", MobileDevice);

        var webSpan = Row(web).ExpiresAt - Row(web).CreatedAt;
        var mobileSpan = Row(mobile).ExpiresAt - Row(mobile).CreatedAt;
        Assert.InRange(webSpan.TotalDays, 13.99, 14.01);
        Assert.InRange(mobileSpan.TotalDays, 6.99, 7.01);
        Assert.InRange((Row(mobile).AbsoluteExpiresAt - Row(mobile).CreatedAt).TotalDays, 29.99, 30.01);
    }

    [Fact]
    public async Task Rotation_CannotExtendASessionPastItsAbsoluteCap()
    {
        var a = await LoginAsync("bob@example.com", MobileDevice);
        Row(a).AbsoluteExpiresAt = DateTime.UtcNow.AddDays(2); // 2 days of life left in total

        var b = (await _sut.RefreshAsync(a, MobileDevice)).Value!;

        // The idle lifetime would be 7 more days, but the hard cap wins.
        Assert.True(b.RefreshTokenExpiresAt <= Row(a).AbsoluteExpiresAt);
        Assert.Equal(Row(a).AbsoluteExpiresAt, Row(b.RefreshToken).AbsoluteExpiresAt);
    }

    [Fact]
    public async Task ATokenPastItsAbsoluteCap_IsRejected_EvenIfItsIdleExpiryIsInTheFuture()
    {
        var a = await LoginAsync("alice@example.com", SessionContext.Web);
        Row(a).AbsoluteExpiresAt = DateTime.UtcNow.AddMinutes(-1);

        Assert.False((await _sut.RefreshAsync(a, SessionContext.Web)).IsSuccess);
    }

    [Fact]
    public async Task AnIdleExpiredToken_IsRejected()
    {
        var a = await LoginAsync("alice@example.com", SessionContext.Web);
        Row(a).ExpiresAt = DateTime.UtcNow.AddSeconds(-1);

        Assert.False((await _sut.RefreshAsync(a, SessionContext.Web)).IsSuccess);
    }

    // ---------- device binding & client type ----------

    [Fact]
    public async Task MobileLogin_StoresOnlyAHashOfTheDeviceId()
    {
        var token = await LoginAsync("alice@example.com", MobileDevice);

        var row = Row(token);
        Assert.Equal(ClientType.Mobile, row.ClientType);
        Assert.Equal(Hash(Device), row.DeviceIdHash);
        Assert.NotEqual(Device, row.DeviceIdHash);
        Assert.Equal("Pixel 8", row.DeviceName);
    }

    [Fact]
    public async Task MobileRefresh_FromTheSameDevice_Works()
    {
        var token = await LoginAsync("alice@example.com", MobileDevice);

        var next = await _sut.RefreshAsync(token, new SessionContext(ClientType.Mobile, Device));

        Assert.True(next.IsSuccess);
        Assert.Equal(Hash(Device), Row(next.Value!.RefreshToken).DeviceIdHash); // binding carries over
    }

    [Fact]
    public async Task AStolenMobileToken_UsedFromAnotherDevice_Fails_AndBurnsTheSession()
    {
        var stolen = await LoginAsync("alice@example.com", MobileDevice);

        var attempt = await _sut.RefreshAsync(stolen, new SessionContext(ClientType.Mobile, OtherDevice));

        Assert.False(attempt.IsSuccess);
        Assert.NotNull(Row(stolen).RevokedAt);
        // The real owner's next refresh now fails too - they must log in again, which is the point:
        // the token was exposed, so it must not stay usable.
        Assert.False((await _sut.RefreshAsync(stolen, MobileDevice)).IsSuccess);
    }

    [Fact]
    public async Task MobileRefresh_WithoutADeviceId_Fails()
    {
        var token = await LoginAsync("alice@example.com", MobileDevice);

        Assert.False((await _sut.RefreshAsync(token, new SessionContext(ClientType.Mobile, null))).IsSuccess);
        Assert.False((await _sut.RefreshAsync(token, new SessionContext(ClientType.Mobile, ""))).IsSuccess);
    }

    [Fact]
    public async Task AWebCookieToken_IsUselessOnTheMobileEndpoint_AndBurnsTheSession()
    {
        // A page pretending to be the app can only present a token it already has; the token's own
        // server-side type decides, not any header from the caller.
        var webToken = await LoginAsync("alice@example.com", SessionContext.Web);

        var attempt = await _sut.RefreshAsync(webToken, new SessionContext(ClientType.Mobile, Device));

        Assert.False(attempt.IsSuccess);
        Assert.NotNull(Row(webToken).RevokedAt);
    }

    [Fact]
    public async Task AMobileToken_IsUselessOnTheWebEndpoint()
    {
        var mobileToken = await LoginAsync("alice@example.com", MobileDevice);

        var attempt = await _sut.RefreshAsync(mobileToken, SessionContext.Web);

        Assert.False(attempt.IsSuccess);
        Assert.NotNull(Row(mobileToken).RevokedAt);
    }

    [Fact]
    public async Task LoggingInAgainOnTheSameDevice_ReplacesTheOldSession()
    {
        var first = await LoginAsync("alice@example.com", MobileDevice);
        var second = await LoginAsync("alice@example.com", MobileDevice);

        Assert.NotNull(Row(first).RevokedAt);
        Assert.Null(Row(second).RevokedAt);
        Assert.Single(await _repo.GetActiveSessionsAsync(_alice.Id, DateTime.UtcNow));
    }

    [Fact]
    public async Task TheNumberOfLiveSessions_IsCapped_OldestFirst()
    {
        for (var i = 0; i < SessionPolicy.MaxSessionsPerUser + 3; i++)
        {
            await LoginAsync("alice@example.com", new SessionContext(ClientType.Mobile, $"device-{i:D20}"));
        }

        var live = await _repo.GetActiveSessionsAsync(_alice.Id, DateTime.UtcNow);
        Assert.Equal(SessionPolicy.MaxSessionsPerUser, live.Count);
    }

    // ---------- logout & revocation ----------

    [Fact]
    public async Task Logout_EndsTheWholeSession_NotJustTheTokenInHand()
    {
        var a = await LoginAsync("alice@example.com", SessionContext.Web);
        var b = (await _sut.RefreshAsync(a, SessionContext.Web)).Value!.RefreshToken;

        await _sut.RevokeRefreshTokenAsync(b, SessionContext.Web);

        Assert.False((await _sut.RefreshAsync(b, SessionContext.Web)).IsSuccess);
        Assert.All(_repo.Tokens.Where(t => t.FamilyId == Row(b).FamilyId), t => Assert.NotNull(t.RevokedAt));
    }

    [Fact]
    public async Task Logout_WithTheWrongDevice_ChangesNothing()
    {
        var token = await LoginAsync("alice@example.com", MobileDevice);

        await _sut.RevokeRefreshTokenAsync(token, new SessionContext(ClientType.Mobile, OtherDevice));

        Assert.Null(Row(token).RevokedAt);
    }

    [Fact]
    public async Task LogoutAll_RevokesEveryDeviceOfThatUser_AndNobodyElse()
    {
        var web = await LoginAsync("alice@example.com", SessionContext.Web);
        var phone = await LoginAsync("alice@example.com", MobileDevice);
        var bobs = await LoginAsync("bob@example.com", SessionContext.Web);

        var count = await _sut.LogoutAllAsync(_alice.Id);

        Assert.Equal(2, count);
        Assert.NotNull(Row(web).RevokedAt);
        Assert.NotNull(Row(phone).RevokedAt);
        Assert.Null(Row(bobs).RevokedAt);
        Assert.False((await _sut.RefreshAsync(phone, MobileDevice)).IsSuccess);
        Assert.False((await _sut.RefreshAsync(web, SessionContext.Web)).IsSuccess);
    }

    [Fact]
    public async Task SessionList_ShowsOneEntryPerDevice_AndMarksTheCurrentOne()
    {
        var web = await LoginAsync("alice@example.com", SessionContext.Web);
        await _sut.RefreshAsync(web, SessionContext.Web); // rotation must not duplicate the session
        await LoginAsync("alice@example.com", MobileDevice);
        await LoginAsync("bob@example.com", SessionContext.Web);

        var currentFamily = Row(web).FamilyId;
        var sessions = await _sut.GetSessionsAsync(_alice.Id, currentFamily);

        Assert.Equal(2, sessions.Count);
        Assert.Single(sessions, s => s.IsCurrent);
        Assert.Equal(currentFamily, sessions.Single(s => s.IsCurrent).SessionId);
        Assert.Contains(sessions, s => s.ClientType == "Mobile" && s.DeviceName == "Pixel 8");
    }

    [Fact]
    public async Task RevokeSession_OfAnotherUsersSession_IsNotFound_AndLeavesItAlone()
    {
        // IDOR: Alice learns/guesses the id of Bob's session and tries to log him out.
        var bobs = await LoginAsync("bob@example.com", SessionContext.Web);
        var bobsSession = Row(bobs).FamilyId;

        var result = await _sut.RevokeSessionAsync(_alice.Id, bobsSession);

        Assert.False(result.IsSuccess);
        Assert.Null(Row(bobs).RevokedAt);
        Assert.True((await _sut.RefreshAsync(bobs, SessionContext.Web)).IsSuccess);
    }

    [Fact]
    public async Task RevokeSession_OfYourOwnSession_SignsThatDeviceOut()
    {
        var phone = await LoginAsync("alice@example.com", MobileDevice);
        var web = await LoginAsync("alice@example.com", SessionContext.Web);

        var result = await _sut.RevokeSessionAsync(_alice.Id, Row(phone).FamilyId);

        Assert.True(result.IsSuccess);
        Assert.False((await _sut.RefreshAsync(phone, MobileDevice)).IsSuccess);
        Assert.True((await _sut.RefreshAsync(web, SessionContext.Web)).IsSuccess);
        Assert.False((await _sut.RevokeSessionAsync(_alice.Id, Guid.NewGuid())).IsSuccess);
    }
}

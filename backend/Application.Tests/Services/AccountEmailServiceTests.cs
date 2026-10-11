using System.Security.Cryptography;
using System.Text.RegularExpressions;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;
using NSubstitute;
using Xunit;
using Application.Common;
using Application.DTOs;
using Application.Interfaces;
using Application.Services;
using Application.Tests.Fakes;
using Domain.Entities;
using Domain.Interfaces;
using Domain.ValueObjects;

namespace Application.Tests.Services;

/// <summary>E-mail confirmation and password reset: token life cycle, uniform answers, session revocation. No database; the
/// token store is an in-memory fake with the same atomic conditional update as the real one.</summary>
public class AccountEmailServiceTests
{
    private static readonly SeoSettings Site = new("https://www.familyshop10.kz", null, 60);

    private readonly IUnitOfWork _unitOfWork = Substitute.For<IUnitOfWork>();
    private readonly IUserRepository _users = Substitute.For<IUserRepository>();
    private readonly FakeEmailTokenRepository _tokens = new();
    private readonly FakeRefreshTokenRepository _refreshTokens = new();
    private readonly CapturingEmailSender _sender = new();
    private readonly IPasswordHasher _hasher = Substitute.For<IPasswordHasher>();
    private readonly EmailRequestThrottle _throttle = new();
    private readonly LoginAttemptTracker _attempts = new();
    private readonly User _alice = new() { Id = 1, Email = new Email("alice@example.com"), Name = "Alice", PasswordHash = "old-hash" };

    public AccountEmailServiceTests()
    {
        _unitOfWork.Users.Returns(_users);
        _unitOfWork.EmailTokens.Returns(_tokens);
        _unitOfWork.RefreshTokens.Returns(_refreshTokens);
        _unitOfWork.ExecuteInTransactionAsync(Arg.Any<Func<CancellationToken, Task<bool>>>(), Arg.Any<CancellationToken>())
            .Returns(call => call.Arg<Func<CancellationToken, Task<bool>>>()(CancellationToken.None));
        _users.GetByIdAsync(1, Arg.Any<CancellationToken>()).Returns(_alice);
        _users.GetByEmailAsync("alice@example.com", Arg.Any<CancellationToken>()).Returns(_alice);
        _refreshTokens.RegisterUser(_alice);
        _hasher.Hash(Arg.Any<string>()).Returns(call => "hash-of-" + call.Arg<string>());
    }

    private AccountEmailService Sut(IBreachedPasswordChecker? breached = null, IEmailSender? sender = null) =>
        new(_unitOfWork, sender ?? _sender, _hasher, _attempts, _throttle, Site,
            NullLogger<AccountEmailService>.Instance, breached, TimeSpan.Zero);

    /// <summary>The raw token as the recipient would read it from the link in the letter.</summary>
    private static string TokenFrom(EmailMessage message)
    {
        var match = Regex.Match(message.TextBody, @"#token=([A-Za-z0-9_-]+)");
        Assert.True(match.Success, "the letter must carry a link with the token");
        return match.Groups[1].Value;
    }

    private async Task<string> RequestResetTokenAsync()
    {
        await Sut().RequestPasswordResetAsync("alice@example.com", "ru");
        return TokenFrom(_sender.Sent.Last());
    }

    private async Task<string> RequestConfirmTokenAsync()
    {
        await Sut().RequestConfirmationAsync("alice@example.com", "ru");
        return TokenFrom(_sender.Sent.Last());
    }

    // ---- token shape ----

    [Fact]
    public async Task TheToken_IsThirtyTwoRandomBytes_AndOnlyItsSha256IsStored()
    {
        var token = await RequestResetTokenAsync();

        var bytes = Convert.FromBase64String(token.Replace('-', '+').Replace('_', '/') + "=");
        Assert.Equal(32, bytes.Length);

        var stored = Assert.Single(_tokens.Tokens);
        Assert.Equal(Convert.ToHexString(SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(token))), stored.TokenHash);
        Assert.DoesNotContain(token, stored.TokenHash, StringComparison.OrdinalIgnoreCase);
        Assert.Equal(EmailTokenPurpose.Reset, stored.Purpose);
    }

    [Fact]
    public async Task TwoRequests_GiveDifferentTokens()
    {
        var first = await RequestResetTokenAsync();
        var second = await RequestResetTokenAsync();

        Assert.NotEqual(first, second);
    }

    [Fact]
    public async Task ResetLinkLivesThirtyMinutes_ConfirmLinkTwentyFourHours()
    {
        await RequestResetTokenAsync();
        await RequestConfirmTokenAsync();

        var reset = _tokens.Tokens.Single(t => t.Purpose == EmailTokenPurpose.Reset);
        var confirm = _tokens.Tokens.Single(t => t.Purpose == EmailTokenPurpose.Confirm);
        Assert.InRange(reset.ExpiresAt - reset.CreatedAt, TimeSpan.FromMinutes(30), TimeSpan.FromMinutes(30));
        Assert.InRange(confirm.ExpiresAt - confirm.CreatedAt, TimeSpan.FromHours(24), TimeSpan.FromHours(24));
    }

    [Fact]
    public async Task TheLinkPointsToTheSite_AndKeepsTheTokenInTheFragment()
    {
        await RequestResetTokenAsync();

        var text = _sender.Sent.Single().TextBody;
        Assert.Contains("https://www.familyshop10.kz/reset-password#token=", text);
        Assert.DoesNotContain("?token=", text);
    }

    [Fact]
    public async Task ANewRequest_ReplacesTheOlderUnusedToken()
    {
        var first = await RequestResetTokenAsync();
        var second = await RequestResetTokenAsync();

        Assert.Single(_tokens.Tokens);
        Assert.Equal(ResetPasswordOutcome.InvalidToken, await Sut().ResetPasswordAsync(first, "Brand-new-pw1"));
        Assert.Equal(ResetPasswordOutcome.Reset, await Sut().ResetPasswordAsync(second, "Brand-new-pw1"));
    }

    // ---- uniform answers ----

    [Fact]
    public async Task ForgotPassword_ForAnUnknownAddress_DoesTheSameFromTheCallersView_AndSendsNothing()
    {
        var known = await Record.ExceptionAsync(() => Sut().RequestPasswordResetAsync("alice@example.com", "en"));
        var unknown = await Record.ExceptionAsync(() => Sut().RequestPasswordResetAsync("nobody@example.com", "en"));

        Assert.Null(known);
        Assert.Null(unknown);
        Assert.Single(_sender.Sent);
        Assert.Equal("alice@example.com", _sender.Sent[0].To);
        Assert.Single(_tokens.Tokens);
    }

    [Fact]
    public async Task ForgotPassword_ForADeletedAccount_SendsNothing()
    {
        _alice.Anonymize(DateTime.UtcNow);
        _users.GetByEmailAsync("alice@example.com", Arg.Any<CancellationToken>()).Returns(_alice);

        await Sut().RequestPasswordResetAsync("alice@example.com", "ru");

        Assert.Empty(_sender.Sent);
        Assert.Empty(_tokens.Tokens);
    }

    [Fact]
    public async Task ForgotPassword_ForAMalformedAddress_DoesNotThrow()
    {
        var error = await Record.ExceptionAsync(() => Sut().RequestPasswordResetAsync("not an address", "ru"));

        Assert.Null(error);
        Assert.Empty(_sender.Sent);
    }

    [Fact]
    public async Task ARequest_TakesAtLeastTheMinimumTime_ForKnownAndUnknownAlike()
    {
        var floor = TimeSpan.FromMilliseconds(150);
        var sut = new AccountEmailService(_unitOfWork, _sender, _hasher, _attempts, new EmailRequestThrottle(), Site,
            NullLogger<AccountEmailService>.Instance, null, floor);

        var knownTime = await TimeAsync(() => sut.RequestPasswordResetAsync("alice@example.com", "ru"));
        var unknownTime = await TimeAsync(() => sut.RequestPasswordResetAsync("nobody@example.com", "ru"));

        Assert.True(knownTime >= floor - TimeSpan.FromMilliseconds(15), $"known took {knownTime}");
        Assert.True(unknownTime >= floor - TimeSpan.FromMilliseconds(15), $"unknown took {unknownTime}");
    }

    private static async Task<TimeSpan> TimeAsync(Func<Task> action)
    {
        var clock = System.Diagnostics.Stopwatch.StartNew();
        await action();
        return clock.Elapsed;
    }

    [Fact]
    public async Task AFailingSender_NeverSurfaces_ToTheCaller()
    {
        var broken = Substitute.For<IEmailSender>();
        broken.SendAsync(Arg.Any<EmailMessage>(), Arg.Any<CancellationToken>()).Returns(Task.FromException(new InvalidOperationException("provider down")));

        var error = await Record.ExceptionAsync(() => Sut(sender: broken).RequestPasswordResetAsync("alice@example.com", "ru"));

        Assert.Null(error);
    }

    // ---- per-address limit ----

    [Fact]
    public async Task AfterThreeRequestsForOneAddress_FurtherOnesSendNothing_ButAnswerTheSame()
    {
        var sut = Sut();
        for (var i = 0; i < 5; i++)
        {
            Assert.Null(await Record.ExceptionAsync(() => sut.RequestPasswordResetAsync("alice@example.com", "ru")));
        }

        Assert.Equal(EmailRequestThrottle.MaxPerWindow, _sender.Sent.Count);
    }

    [Fact]
    public async Task TheAddressLimit_IsNotSharedBetweenResetAndConfirmation()
    {
        var sut = Sut();
        for (var i = 0; i < 3; i++)
        {
            await sut.RequestPasswordResetAsync("alice@example.com", "ru");
        }

        await sut.RequestConfirmationAsync("alice@example.com", "ru");

        Assert.Equal(4, _sender.Sent.Count);
    }

    // ---- confirming ----

    [Fact]
    public async Task Confirm_SetsEmailConfirmedAt_AndTheLinkWorksOnce()
    {
        var token = await RequestConfirmTokenAsync();

        Assert.Equal(ConfirmEmailOutcome.Confirmed, await Sut().ConfirmEmailAsync(token));
        Assert.NotNull(_alice.EmailConfirmedAt);
        Assert.Equal(ConfirmEmailOutcome.InvalidToken, await Sut().ConfirmEmailAsync(token));
    }

    [Fact]
    public async Task Confirm_WithAnExpiredToken_IsRefused_AndConfirmsNothing()
    {
        var token = await RequestConfirmTokenAsync();
        _tokens.Tokens.Single().ExpiresAt = DateTime.UtcNow.AddMinutes(-1);

        Assert.Equal(ConfirmEmailOutcome.InvalidToken, await Sut().ConfirmEmailAsync(token));
        Assert.Null(_alice.EmailConfirmedAt);
    }

    [Fact]
    public async Task Confirm_WithAnUnknownToken_IsRefused()
    {
        Assert.Equal(ConfirmEmailOutcome.InvalidToken, await Sut().ConfirmEmailAsync("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"));
    }

    [Fact]
    public async Task AResetToken_DoesNotConfirmTheAddress_AndTheOtherWayRound()
    {
        var reset = await RequestResetTokenAsync();
        var confirm = await RequestConfirmTokenAsync();

        Assert.Equal(ConfirmEmailOutcome.InvalidToken, await Sut().ConfirmEmailAsync(reset));
        Assert.Equal(ResetPasswordOutcome.InvalidToken, await Sut().ResetPasswordAsync(confirm, "Brand-new-pw1"));
    }

    [Fact]
    public async Task Resend_ForAnAlreadyConfirmedAddress_SendsNothing()
    {
        _alice.EmailConfirmedAt = DateTime.UtcNow;

        await Sut().RequestConfirmationAsync("alice@example.com", "ru");

        Assert.Empty(_sender.Sent);
    }

    [Fact]
    public async Task TwoSimultaneousConfirmations_OfOneToken_OnlyOneWins()
    {
        var token = await RequestConfirmTokenAsync();

        var outcomes = await Task.WhenAll(Enumerable.Range(0, 12).Select(_ => Task.Run(() => Sut().ConfirmEmailAsync(token))));

        Assert.Equal(1, outcomes.Count(o => o == ConfirmEmailOutcome.Confirmed));
    }

    [Fact]
    public async Task SendConfirmation_AfterRegistration_SendsALetter_AndNeverThrows()
    {
        await Sut().SendConfirmationAsync(1, "kk");

        var message = Assert.Single(_sender.Sent);
        Assert.Equal("alice@example.com", message.To);
        Assert.Contains("confirm-email#token=", message.TextBody);

        var broken = Substitute.For<IEmailSender>();
        broken.SendAsync(Arg.Any<EmailMessage>(), Arg.Any<CancellationToken>()).Returns(Task.FromException(new InvalidOperationException()));
        Assert.Null(await Record.ExceptionAsync(() => Sut(sender: broken).SendConfirmationAsync(1, "ru")));
    }

    // ---- resetting ----

    [Fact]
    public async Task Reset_StoresTheNewHash_UsesTheTokenUp_AndEndsEverySession()
    {
        // two live sessions: one web, one mobile
        var now = DateTime.UtcNow;
        _refreshTokens.Tokens.Add(new RefreshToken { UserId = 1, TokenHash = "w", FamilyId = Guid.NewGuid(), ClientType = ClientType.Web, ExpiresAt = now.AddDays(1), AbsoluteExpiresAt = now.AddDays(5) });
        _refreshTokens.Tokens.Add(new RefreshToken { UserId = 1, TokenHash = "m", FamilyId = Guid.NewGuid(), ClientType = ClientType.Mobile, ExpiresAt = now.AddDays(1), AbsoluteExpiresAt = now.AddDays(5) });
        var token = await RequestResetTokenAsync();

        var outcome = await Sut().ResetPasswordAsync(token, "Brand-new-pw1");

        Assert.Equal(ResetPasswordOutcome.Reset, outcome);
        Assert.Equal("hash-of-Brand-new-pw1", _alice.PasswordHash);
        Assert.All(_refreshTokens.Tokens, t => Assert.NotNull(t.RevokedAt));
        Assert.Equal(ResetPasswordOutcome.InvalidToken, await Sut().ResetPasswordAsync(token, "Another-pw-2"));
        Assert.Equal("hash-of-Brand-new-pw1", _alice.PasswordHash);
    }

    [Fact]
    public async Task Reset_ClearsAPauseAfterWrongPasswords_AndProvesTheAddress()
    {
        for (var i = 0; i < 6; i++)
        {
            _attempts.RegisterFailure("alice@example.com");
        }

        Assert.True(_attempts.IsLocked("alice@example.com"));
        var token = await RequestResetTokenAsync();

        await Sut().ResetPasswordAsync(token, "Brand-new-pw1");

        Assert.False(_attempts.IsLocked("alice@example.com"));
        Assert.NotNull(_alice.EmailConfirmedAt);
    }

    [Fact]
    public async Task Reset_WithTheAddressAsPassword_IsRefused_AndKeepsTheLinkUsable()
    {
        var token = await RequestResetTokenAsync();

        Assert.Equal(ResetPasswordOutcome.NotAllowed, await Sut().ResetPasswordAsync(token, "Alice@Example.com"));
        Assert.Equal("old-hash", _alice.PasswordHash);
        Assert.Equal(ResetPasswordOutcome.Reset, await Sut().ResetPasswordAsync(token, "Brand-new-pw1"));
    }

    [Fact]
    public async Task Reset_WithABreachedPassword_IsRefused_AndKeepsTheLinkUsable()
    {
        var breached = Substitute.For<IBreachedPasswordChecker>();
        breached.IsBreachedAsync("Password1", Arg.Any<CancellationToken>()).Returns(true);
        var token = await RequestResetTokenAsync();

        Assert.Equal(ResetPasswordOutcome.BreachedPassword, await Sut(breached).ResetPasswordAsync(token, "Password1"));
        Assert.Equal(ResetPasswordOutcome.Reset, await Sut(breached).ResetPasswordAsync(token, "Brand-new-pw1"));
    }

    [Fact]
    public async Task Reset_WithAnExpiredToken_ChangesNothing()
    {
        var token = await RequestResetTokenAsync();
        _tokens.Tokens.Single().ExpiresAt = DateTime.UtcNow.AddSeconds(-1);

        Assert.Equal(ResetPasswordOutcome.InvalidToken, await Sut().ResetPasswordAsync(token, "Brand-new-pw1"));
        Assert.Equal("old-hash", _alice.PasswordHash);
    }

    [Fact]
    public async Task TwoSimultaneousResets_OfOneToken_OnlyOneWins()
    {
        var token = await RequestResetTokenAsync();

        var outcomes = await Task.WhenAll(Enumerable.Range(0, 12).Select(i =>
            Task.Run(() => Sut().ResetPasswordAsync(token, $"Brand-new-pw{i}"))));

        Assert.Equal(1, outcomes.Count(o => o == ResetPasswordOutcome.Reset));
        Assert.Equal(11, outcomes.Count(o => o == ResetPasswordOutcome.InvalidToken));
    }

    [Fact]
    public async Task Reset_ForAnAccountDeletedMeanwhile_IsRefused()
    {
        var token = await RequestResetTokenAsync();
        _alice.Anonymize(DateTime.UtcNow);

        Assert.Equal(ResetPasswordOutcome.InvalidToken, await Sut().ResetPasswordAsync(token, "Brand-new-pw1"));
    }

    // ---- through registration and account deletion ----

    [Fact]
    public async Task Registration_SendsTheConfirmationLetter_AndSucceedsEvenWhenTheLetterFails()
    {
        var created = new User { Id = 9, Email = new Email("new@example.com"), Name = "New" };
        _users.GetByEmailAsync("new@example.com", Arg.Any<CancellationToken>()).Returns((User?)null);
        _users.AddAsync(Arg.Do<User>(u => u.Id = 9), Arg.Any<CancellationToken>()).Returns(Task.CompletedTask);
        _users.GetByIdAsync(9, Arg.Any<CancellationToken>()).Returns(created);
        var jwt = Substitute.For<IJwtTokenGenerator>();
        jwt.GenerateAccessToken(Arg.Any<User>(), Arg.Any<Guid>()).Returns("access");
        jwt.GenerateRefreshToken().Returns("refresh");

        var broken = Substitute.For<IEmailSender>();
        broken.SendAsync(Arg.Any<EmailMessage>(), Arg.Any<CancellationToken>()).Returns(Task.FromException(new InvalidOperationException()));
        var auth = new AuthService(_unitOfWork, _hasher, jwt, NullLogger<AuthService>.Instance, null, null, Sut(sender: broken));

        var result = await auth.RegisterAsync(new RegisterRequestDto("new@example.com", "Tr1ckyTestValue", "New", "kk"), SessionContext.Web);

        Assert.True(result.IsSuccess);
        Assert.False(result.Value!.Response.EmailConfirmed);
        Assert.Single(_tokens.Tokens);
    }

    [Fact]
    public async Task DeletingTheAccount_RemovesItsEmailTokens()
    {
        _hasher.Verify("pw", "old-hash").Returns(true);
        _unitOfWork.Orders.HasActiveOrdersForUserAsync(1, Arg.Any<CancellationToken>()).Returns(false);
        await RequestResetTokenAsync();
        await RequestConfirmTokenAsync();
        var auth = new AuthService(_unitOfWork, _hasher, Substitute.For<IJwtTokenGenerator>(), NullLogger<AuthService>.Instance);

        var outcome = await auth.DeleteAccountAsync(1, "pw");

        Assert.Equal(DeleteAccountOutcome.Deleted, outcome);
        Assert.Empty(_tokens.Tokens);
    }
}

/// <summary>The fake sender: remembers what would have been sent.</summary>
public sealed class CapturingEmailSender : IEmailSender
{
    private readonly object _gate = new();
    public List<EmailMessage> Sent { get; } = new();

    public Task SendAsync(EmailMessage message, CancellationToken cancellationToken = default)
    {
        lock (_gate)
        {
            Sent.Add(message);
        }

        return Task.CompletedTask;
    }
}

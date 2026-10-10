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

/// <summary>Sign-in pause after repeated wrong passwords (same answer as a plain wrong password) and the password change
/// (current password required, every session ended).</summary>
public class PasswordChangeAndLockoutTests
{
    private readonly IUnitOfWork _unitOfWork = Substitute.For<IUnitOfWork>();
    private readonly IUserRepository _users = Substitute.For<IUserRepository>();
    private readonly FakeRefreshTokenRepository _refreshTokens = new();
    private readonly IPasswordHasher _passwordHasher = Substitute.For<IPasswordHasher>();
    private readonly IJwtTokenGenerator _jwt = Substitute.For<IJwtTokenGenerator>();
    private readonly AuthService _sut;
    private int _tokenCounter;

    private readonly User _alice = new() { Id = 1, Email = new Email("alice@example.com"), Name = "Alice", PasswordHash = "hash-alice", Role = UserRole.Customer };

    public PasswordChangeAndLockoutTests()
    {
        _unitOfWork.Users.Returns(_users);
        _unitOfWork.RefreshTokens.Returns(_refreshTokens);
        _unitOfWork.ExecuteInTransactionAsync(Arg.Any<Func<CancellationToken, Task<bool>>>(), Arg.Any<CancellationToken>())
            .Returns(call => call.Arg<Func<CancellationToken, Task<bool>>>()(CancellationToken.None));
        _users.GetByIdAsync(1, Arg.Any<CancellationToken>()).Returns(_alice);
        _users.GetByEmailAsync("alice@example.com", Arg.Any<CancellationToken>()).Returns(_alice);
        _refreshTokens.RegisterUser(_alice);

        _passwordHasher.Verify(Arg.Any<string>(), Arg.Any<string>()).Returns(false);
        _passwordHasher.Verify("alice-pw", "hash-alice").Returns(true);
        // AuthService keeps its dummy hash in a static field shared by every test class, so any Hash() call that is not
        // the one under test must return the same "dummy-hash" the other test classes use.
        _passwordHasher.Hash(Arg.Any<string>()).Returns("dummy-hash");
        _passwordHasher.Hash("brand-new-pw1").Returns("hash-of-brand-new-pw1");
        _jwt.GenerateAccessToken(Arg.Any<User>(), Arg.Any<Guid>()).Returns("access-token");
        _jwt.GenerateRefreshToken().Returns(_ => $"refresh-token-{++_tokenCounter}");
        _jwt.AccessTokenLifetimeSeconds.Returns(900);
        _sut = new AuthService(_unitOfWork, _passwordHasher, _jwt, NullLogger<AuthService>.Instance);
    }

    private Task<Result<AuthResult>> SignIn(string password) =>
        _sut.LoginAsync(new LoginRequestDto("alice@example.com", password), SessionContext.Web);

    [Fact]
    public async Task AfterFiveWrongPasswords_EvenTheRightOneIsRefused_WithTheSameMessage()
    {
        Result<AuthResult> wrong = null!;
        for (var i = 0; i < 5; i++)
        {
            wrong = await SignIn("nope");
        }

        var rightWhilePaused = await SignIn("alice-pw");

        Assert.False(rightWhilePaused.IsSuccess);
        Assert.Equal(wrong.Errors, rightWhilePaused.Errors);
    }

    [Fact]
    public async Task FourWrongPasswords_ThenTheRightOne_StillSignsIn_AndResetsTheCount()
    {
        for (var i = 0; i < 4; i++)
        {
            await SignIn("nope");
        }

        Assert.True((await SignIn("alice-pw")).IsSuccess);

        for (var i = 0; i < 4; i++)
        {
            await SignIn("nope");
        }

        Assert.True((await SignIn("alice-pw")).IsSuccess);
    }

    [Fact]
    public async Task ChangePassword_WithTheRightCurrentPassword_StoresTheNewHash_AndEndsEverySession()
    {
        await SignIn("alice-pw");
        await _sut.LoginAsync(new LoginRequestDto("alice@example.com", "alice-pw"), new SessionContext(ClientType.Mobile, "device-0123456789abcdef", "Phone"));

        var outcome = await _sut.ChangePasswordAsync(1, "alice-pw", "brand-new-pw1");

        Assert.Equal(ChangePasswordOutcome.Changed, outcome);
        Assert.Equal("hash-of-brand-new-pw1", _alice.PasswordHash);
        Assert.Empty(await _sut.GetSessionsAsync(1, null));
    }

    [Fact]
    public async Task ChangePassword_WithAWrongCurrentPassword_ChangesNothing()
    {
        await SignIn("alice-pw");

        var outcome = await _sut.ChangePasswordAsync(1, "not-her-password", "brand-new-pw1");

        Assert.Equal(ChangePasswordOutcome.InvalidPassword, outcome);
        Assert.Equal("hash-alice", _alice.PasswordHash);
        Assert.Single(await _sut.GetSessionsAsync(1, null));
    }

    [Fact]
    public async Task ChangePassword_GuessesCountTowardsThePause()
    {
        for (var i = 0; i < 5; i++)
        {
            await _sut.ChangePasswordAsync(1, "guess", "brand-new-pw1");
        }

        var rightWhilePaused = await _sut.ChangePasswordAsync(1, "alice-pw", "brand-new-pw1");

        Assert.Equal(ChangePasswordOutcome.InvalidPassword, rightWhilePaused);
        Assert.Equal("hash-alice", _alice.PasswordHash);
    }

    [Fact]
    public async Task ChangePassword_ToTheEmailAddress_IsRefused()
    {
        var outcome = await _sut.ChangePasswordAsync(1, "alice-pw", "alice@example.com");

        Assert.Equal(ChangePasswordOutcome.NotAllowed, outcome);
        Assert.Equal("hash-alice", _alice.PasswordHash);
    }

    [Fact]
    public async Task ChangePassword_ForADeletedAccount_IsNotFound()
    {
        _alice.Anonymize(DateTime.UtcNow);

        Assert.Equal(ChangePasswordOutcome.NotFound, await _sut.ChangePasswordAsync(1, "alice-pw", "brand-new-pw1"));
    }
}

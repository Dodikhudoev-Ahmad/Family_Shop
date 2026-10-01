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

public class AuthServiceTests
{
    private readonly IUnitOfWork _unitOfWork = Substitute.For<IUnitOfWork>();
    private readonly IUserRepository _users = Substitute.For<IUserRepository>();
    private readonly FakeRefreshTokenRepository _refreshTokens = new();
    private readonly IPasswordHasher _passwordHasher = Substitute.For<IPasswordHasher>();
    private readonly IJwtTokenGenerator _jwt = Substitute.For<IJwtTokenGenerator>();
    private readonly AuthService _sut;
    private int _tokenCounter;

    public AuthServiceTests()
    {
        _unitOfWork.Users.Returns(_users);
        _unitOfWork.RefreshTokens.Returns(_refreshTokens);
        _jwt.GenerateAccessToken(Arg.Any<User>(), Arg.Any<Guid>()).Returns("access-token");
        _jwt.GenerateRefreshToken().Returns(_ => $"refresh-token-{++_tokenCounter}");
        _jwt.AccessTokenLifetimeSeconds.Returns(900);
        _sut = new AuthService(_unitOfWork, _passwordHasher, _jwt, NullLogger<AuthService>.Instance);
    }

    [Fact]
    public async Task RegisterAsync_WithNewEmail_CreatesUserAndReturnsTokens()
    {
        _users.GetByEmailAsync("new@example.com", Arg.Any<CancellationToken>()).Returns((User?)null);
        _passwordHasher.Hash("Password123").Returns("hashed");

        var result = await _sut.RegisterAsync(new RegisterRequestDto("new@example.com", "Password123", "Alice"), SessionContext.Web);

        Assert.True(result.IsSuccess);
        Assert.Equal("access-token", result.Value!.Response.AccessToken);
        Assert.Equal("refresh-token-1", result.Value.RefreshToken);
        await _users.Received(1).AddAsync(Arg.Is<User>(u => u.Email.Value == "new@example.com"), Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task RegisterAsync_WithDuplicateEmail_ReturnsFailure()
    {
        _users.GetByEmailAsync("taken@example.com", Arg.Any<CancellationToken>())
            .Returns(new User { Id = 1, Email = new Email("taken@example.com"), Name = "Existing" });

        var result = await _sut.RegisterAsync(new RegisterRequestDto("taken@example.com", "Password123", "Bob"), SessionContext.Web);

        Assert.False(result.IsSuccess);
        await _users.DidNotReceive().AddAsync(Arg.Any<User>(), Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task LoginAsync_WithWrongPassword_ReturnsFailure()
    {
        var user = new User { Id = 1, Email = new Email("user@example.com"), Name = "User", PasswordHash = "hashed" };
        _users.GetByEmailAsync("user@example.com", Arg.Any<CancellationToken>()).Returns(user);
        _passwordHasher.Verify("wrong-password", "hashed").Returns(false);

        var result = await _sut.LoginAsync(new LoginRequestDto("user@example.com", "wrong-password"), SessionContext.Web);

        Assert.False(result.IsSuccess);
    }

    [Fact]
    public async Task LoginAsync_UnknownEmail_FailsWithTheSameMessageAsAWrongPassword_AndStillRunsAPasswordCheck()
    {
        // Account enumeration: both failures must look identical in the response AND take comparable
        // time - so an unknown e-mail still pays for one password verification (against a dummy hash).
        var user = new User { Id = 1, Email = new Email("real@example.com"), Name = "User", PasswordHash = "real-hash" };
        _users.GetByEmailAsync("real@example.com", Arg.Any<CancellationToken>()).Returns(user);
        _users.GetByEmailAsync("ghost@example.com", Arg.Any<CancellationToken>()).Returns((User?)null);
        _passwordHasher.Hash(Arg.Any<string>()).Returns("dummy-hash");
        _passwordHasher.Verify(Arg.Any<string>(), Arg.Any<string>()).Returns(false);

        var wrongPassword = await _sut.LoginAsync(new LoginRequestDto("real@example.com", "nope"), SessionContext.Web);
        var unknownUser = await _sut.LoginAsync(new LoginRequestDto("ghost@example.com", "nope"), SessionContext.Web);

        Assert.False(wrongPassword.IsSuccess);
        Assert.False(unknownUser.IsSuccess);
        Assert.Equal(wrongPassword.Errors, unknownUser.Errors);
        _passwordHasher.Received(1).Verify("nope", "real-hash");
        _passwordHasher.Received(1).Verify("nope", "dummy-hash");
    }

    [Fact]
    public async Task LoginAsync_WithCorrectPassword_StartsAWebSession_WithTheWebLifetimes()
    {
        var user = new User { Id = 7, Email = new Email("user@example.com"), Name = "User", PasswordHash = "hashed" };
        _users.GetByEmailAsync("user@example.com", Arg.Any<CancellationToken>()).Returns(user);
        _passwordHasher.Verify("pw", "hashed").Returns(true);

        var before = DateTime.UtcNow;
        var result = await _sut.LoginAsync(new LoginRequestDto("user@example.com", "pw"), SessionContext.Web);

        Assert.True(result.IsSuccess);
        var token = Assert.Single(_refreshTokens.Tokens);
        Assert.Equal(ClientType.Web, token.ClientType);
        Assert.Null(token.DeviceIdHash);
        Assert.InRange(token.ExpiresAt, before.AddDays(14).AddSeconds(-5), DateTime.UtcNow.AddDays(14).AddSeconds(5));
        Assert.InRange(token.AbsoluteExpiresAt, before.AddDays(60).AddSeconds(-5), DateTime.UtcNow.AddDays(60).AddSeconds(5));
        Assert.Equal(token.ExpiresAt, result.Value!.RefreshTokenExpiresAt);
        Assert.Equal(900, result.Value.AccessTokenLifetimeSeconds);
    }

    [Fact]
    public async Task LoginAsync_AlsoPurgesLongDeadTokens()
    {
        var user = new User { Id = 1, Email = new Email("user@example.com"), Name = "User", PasswordHash = "hashed" };
        _users.GetByEmailAsync("user@example.com", Arg.Any<CancellationToken>()).Returns(user);
        _passwordHasher.Verify("pw", "hashed").Returns(true);

        await _sut.LoginAsync(new LoginRequestDto("user@example.com", "pw"), SessionContext.Web);

        Assert.Equal(1, _refreshTokens.DeleteDeadCalls);
    }
}

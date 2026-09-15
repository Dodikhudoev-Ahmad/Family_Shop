using Microsoft.Extensions.Logging.Abstractions;
using NSubstitute;
using Xunit;
using Application.DTOs;
using Application.Interfaces;
using Application.Services;
using Domain.Entities;
using Domain.Interfaces;

namespace Application.Tests.Services;

public class AuthServiceTests
{
    private readonly IUnitOfWork _unitOfWork = Substitute.For<IUnitOfWork>();
    private readonly IUserRepository _users = Substitute.For<IUserRepository>();
    private readonly IRefreshTokenRepository _refreshTokens = Substitute.For<IRefreshTokenRepository>();
    private readonly IPasswordHasher _passwordHasher = Substitute.For<IPasswordHasher>();
    private readonly IJwtTokenGenerator _jwtTokenGenerator = Substitute.For<IJwtTokenGenerator>();
    private readonly AuthService _sut;

    public AuthServiceTests()
    {
        _unitOfWork.Users.Returns(_users);
        _unitOfWork.RefreshTokens.Returns(_refreshTokens);
        _sut = new AuthService(_unitOfWork, _passwordHasher, _jwtTokenGenerator, NullLogger<AuthService>.Instance);
    }

    [Fact]
    public async Task RegisterAsync_WithNewEmail_CreatesUserAndReturnsTokens()
    {
        _users.GetByEmailAsync("new@example.com", Arg.Any<CancellationToken>())
            .Returns((User?)null);
        _passwordHasher.Hash("Password123").Returns("hashed");
        _jwtTokenGenerator.GenerateAccessToken(Arg.Any<User>()).Returns("access-token");
        _jwtTokenGenerator.GenerateRefreshToken().Returns("refresh-token");

        var request = new RegisterRequestDto("new@example.com", "Password123", "Alice");
        var result = await _sut.RegisterAsync(request);

        Assert.True(result.IsSuccess);
        Assert.Equal("access-token", result.Value!.Response.AccessToken);
        Assert.Equal("refresh-token", result.Value.RefreshToken);
        await _users.Received(1).AddAsync(Arg.Is<User>(u => u.Email.Value == "new@example.com"), Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task RegisterAsync_WithDuplicateEmail_ReturnsFailure()
    {
        _users.GetByEmailAsync("taken@example.com", Arg.Any<CancellationToken>())
            .Returns(new User { Id = 1, Email = new Domain.ValueObjects.Email("taken@example.com"), Name = "Existing" });

        var request = new RegisterRequestDto("taken@example.com", "Password123", "Bob");
        var result = await _sut.RegisterAsync(request);

        Assert.False(result.IsSuccess);
        await _users.DidNotReceive().AddAsync(Arg.Any<User>(), Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task LoginAsync_WithWrongPassword_ReturnsFailure()
    {
        var user = new User { Id = 1, Email = new Domain.ValueObjects.Email("user@example.com"), Name = "User", PasswordHash = "hashed" };
        _users.GetByEmailAsync("user@example.com", Arg.Any<CancellationToken>()).Returns(user);
        _passwordHasher.Verify("wrong-password", "hashed").Returns(false);

        var result = await _sut.LoginAsync(new LoginRequestDto("user@example.com", "wrong-password"));

        Assert.False(result.IsSuccess);
    }

    [Fact]
    public async Task RefreshAsync_WithActiveToken_RevokesOldTokenAndIssuesNewOne()
    {
        var user = new User { Id = 1, Email = new Domain.ValueObjects.Email("user@example.com"), Name = "User" };
        var existingToken = new RefreshToken
        {
            Id = 1,
            UserId = 1,
            User = user,
            TokenHash = Application.Common.TokenHasher.Hash("valid-refresh-token"),
            ExpiresAt = DateTime.UtcNow.AddDays(1)
        };

        _refreshTokens.GetByTokenHashAsync(Arg.Any<string>(), Arg.Any<CancellationToken>())
            .Returns(existingToken);
        _jwtTokenGenerator.GenerateAccessToken(user).Returns("new-access-token");
        _jwtTokenGenerator.GenerateRefreshToken().Returns("new-refresh-token");

        var result = await _sut.RefreshAsync("valid-refresh-token");

        Assert.True(result.IsSuccess);
        Assert.NotNull(existingToken.RevokedAt);
        Assert.Equal("new-access-token", result.Value!.Response.AccessToken);
    }

    [Fact]
    public async Task RefreshAsync_WithRevokedToken_ReturnsFailure()
    {
        var revokedToken = new RefreshToken
        {
            Id = 1,
            UserId = 1,
            User = new User { Id = 1, Email = new Domain.ValueObjects.Email("user@example.com") },
            TokenHash = Application.Common.TokenHasher.Hash("revoked-token"),
            ExpiresAt = DateTime.UtcNow.AddDays(1),
            RevokedAt = DateTime.UtcNow.AddMinutes(-1)
        };

        _refreshTokens.GetByTokenHashAsync(Arg.Any<string>(), Arg.Any<CancellationToken>())
            .Returns(revokedToken);

        var result = await _sut.RefreshAsync("revoked-token");

        Assert.False(result.IsSuccess);
    }
}

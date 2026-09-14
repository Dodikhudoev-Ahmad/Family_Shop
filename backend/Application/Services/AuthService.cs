using Microsoft.Extensions.Logging;
using Application.Common;
using Application.DTOs;
using Application.Interfaces;
using Domain.Entities;
using Domain.Interfaces;
using Domain.ValueObjects;

namespace Application.Services;

public class AuthService : IAuthService
{
    private readonly IUnitOfWork _unitOfWork;
    private readonly IPasswordHasher _passwordHasher;
    private readonly IJwtTokenGenerator _jwtTokenGenerator;
    private readonly ILogger<AuthService> _logger;
    private const int RefreshTokenExpirationDays = 14;

    public AuthService(
        IUnitOfWork unitOfWork,
        IPasswordHasher passwordHasher,
        IJwtTokenGenerator jwtTokenGenerator,
        ILogger<AuthService> logger)
    {
        _unitOfWork = unitOfWork;
        _passwordHasher = passwordHasher;
        _jwtTokenGenerator = jwtTokenGenerator;
        _logger = logger;
    }

    public async Task<Result<AuthResult>> RegisterAsync(RegisterRequestDto request, CancellationToken cancellationToken = default)
    {
        var existing = await _unitOfWork.Users.GetByEmailAsync(request.Email, cancellationToken);
        if (existing is not null)
        {
            _logger.LogWarning("Registration attempt with already-used email.");
            return Result<AuthResult>.Failure("A user with this email already exists.");
        }

        var user = new User
        {
            Email = new Email(request.Email),
            Name = request.Name,
            PasswordHash = _passwordHasher.Hash(request.Password),
            Role = UserRole.Customer
        };

        await _unitOfWork.Users.AddAsync(user, cancellationToken);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        var result = await IssueTokensAsync(user, cancellationToken);
        return Result<AuthResult>.Success(result);
    }

    public async Task<Result<AuthResult>> LoginAsync(LoginRequestDto request, CancellationToken cancellationToken = default)
    {
        var user = await _unitOfWork.Users.GetByEmailAsync(request.Email, cancellationToken);
        if (user is null || !_passwordHasher.Verify(request.Password, user.PasswordHash))
        {
            _logger.LogWarning("Failed login attempt for a user.");
            return Result<AuthResult>.Failure("Invalid email or password.");
        }

        var result = await IssueTokensAsync(user, cancellationToken);
        return Result<AuthResult>.Success(result);
    }

    public async Task<Result<AuthResult>> RefreshAsync(string refreshToken, CancellationToken cancellationToken = default)
    {
        var hash = TokenHasher.Hash(refreshToken);
        var existing = await _unitOfWork.RefreshTokens.GetByTokenHashAsync(hash, cancellationToken);

        if (existing is null || !existing.IsActive || existing.User is null)
        {
            _logger.LogWarning("Refresh token reuse or invalid refresh token detected.");
            return Result<AuthResult>.Failure("Invalid or expired refresh token.");
        }

        existing.RevokedAt = DateTime.UtcNow;
        var result = await IssueTokensAsync(existing.User, cancellationToken);
        return Result<AuthResult>.Success(result);
    }

    public async Task RevokeRefreshTokenAsync(string refreshToken, CancellationToken cancellationToken = default)
    {
        var hash = TokenHasher.Hash(refreshToken);
        var existing = await _unitOfWork.RefreshTokens.GetByTokenHashAsync(hash, cancellationToken);
        if (existing is not null && existing.IsActive)
        {
            existing.RevokedAt = DateTime.UtcNow;
            await _unitOfWork.SaveChangesAsync(cancellationToken);
        }
    }

    private async Task<AuthResult> IssueTokensAsync(User user, CancellationToken cancellationToken)
    {
        var accessToken = _jwtTokenGenerator.GenerateAccessToken(user);
        var refreshToken = _jwtTokenGenerator.GenerateRefreshToken();

        await _unitOfWork.RefreshTokens.AddAsync(new RefreshToken
        {
            UserId = user.Id,
            TokenHash = TokenHasher.Hash(refreshToken),
            ExpiresAt = DateTime.UtcNow.AddDays(RefreshTokenExpirationDays)
        }, cancellationToken);

        await _unitOfWork.SaveChangesAsync(cancellationToken);

        var response = new AuthResponseDto(user.Id, user.Email.Value, user.Name, user.Role.ToString(), accessToken);
        return new AuthResult(response, refreshToken);
    }
}

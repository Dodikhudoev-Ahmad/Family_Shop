using FamilyShop.Application.Common;
using FamilyShop.Application.DTOs;

namespace FamilyShop.Application.Interfaces;

public interface IAuthService
{
    Task<Result<AuthResult>> RegisterAsync(RegisterRequestDto request, CancellationToken cancellationToken = default);
    Task<Result<AuthResult>> LoginAsync(LoginRequestDto request, CancellationToken cancellationToken = default);
    Task<Result<AuthResult>> RefreshAsync(string refreshToken, CancellationToken cancellationToken = default);
    Task RevokeRefreshTokenAsync(string refreshToken, CancellationToken cancellationToken = default);
}

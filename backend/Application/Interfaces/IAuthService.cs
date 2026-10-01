using Application.Common;
using Application.DTOs;

namespace Application.Interfaces;

public interface IAuthService
{
    Task<Result<AuthResult>> RegisterAsync(RegisterRequestDto request, SessionContext session, CancellationToken cancellationToken = default);
    Task<Result<AuthResult>> LoginAsync(LoginRequestDto request, SessionContext session, CancellationToken cancellationToken = default);
    Task<Result<AuthResult>> RefreshAsync(string refreshToken, SessionContext session, CancellationToken cancellationToken = default);
    Task RevokeRefreshTokenAsync(string refreshToken, SessionContext session, CancellationToken cancellationToken = default);

    /// <summary>Signs the user out of every device (web and mobile).</summary>
    Task<int> LogoutAllAsync(int userId, CancellationToken cancellationToken = default);

    /// <summary>The user's live sessions. <paramref name="currentSessionId"/> (the access token's sid) marks the caller's own.</summary>
    Task<IReadOnlyList<SessionDto>> GetSessionsAsync(int userId, Guid? currentSessionId, CancellationToken cancellationToken = default);

    /// <summary>Signs out one device. Fails (not found) for a session that is not the user's own.</summary>
    Task<Result<bool>> RevokeSessionAsync(int userId, Guid sessionId, CancellationToken cancellationToken = default);
}

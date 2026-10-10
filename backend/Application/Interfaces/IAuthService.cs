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

    /// <summary>Deletes the caller's own account (App Store 5.1.1(v)): checks the password, ends every session, strips the
    /// personal data and keeps orders and reviews, detached from it. Administrators cannot use this path.</summary>
    Task<DeleteAccountOutcome> DeleteAccountAsync(int userId, string password, CancellationToken cancellationToken = default);

    /// <summary>Changes the caller's own password after checking the current one, and ends every session (web and mobile),
    /// so whoever held the old password or a stolen token is signed out. The caller signs in again with the new password.</summary>
    Task<ChangePasswordOutcome> ChangePasswordAsync(int userId, string currentPassword, string newPassword, CancellationToken cancellationToken = default);

    /// <summary>Signs out one device. Fails (not found) for a session that is not the user's own.</summary>
    Task<Result<bool>> RevokeSessionAsync(int userId, Guid sessionId, CancellationToken cancellationToken = default);
}

public enum DeleteAccountOutcome
{
    Deleted,
    InvalidPassword,
    NotAllowed,
    /// <summary>An order is still in progress; the account stays until it is delivered or cancelled.</summary>
    ActiveOrders,
    NotFound
}

public enum ChangePasswordOutcome
{
    Changed,
    /// <summary>The current password is wrong (or the account is paused after too many wrong ones).</summary>
    InvalidPassword,
    /// <summary>The new password equals the account's e-mail address.</summary>
    NotAllowed,
    NotFound
}

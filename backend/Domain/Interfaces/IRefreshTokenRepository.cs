using Domain.Entities;

namespace Domain.Interfaces;

public interface IRefreshTokenRepository : IRepository<RefreshToken>
{
    Task<RefreshToken?> GetByTokenHashAsync(string tokenHash, CancellationToken cancellationToken = default);

    /// <summary>
    /// Atomically marks the token as rotated, but only if it was still unused and unrevoked. Exactly one
    /// of several concurrent refreshes presenting the same token wins (returns true); the rest get false.
    /// </summary>
    Task<bool> TryMarkRotatedAsync(int id, DateTime now, CancellationToken cancellationToken = default);

    /// <summary>Revokes every live token of one session family. Returns how many were revoked.</summary>
    Task<int> RevokeFamilyAsync(Guid familyId, DateTime now, CancellationToken cancellationToken = default);

    /// <summary>Revokes all of a user's sessions (web and mobile) - "sign out everywhere".</summary>
    Task<int> RevokeAllForUserAsync(int userId, DateTime now, CancellationToken cancellationToken = default);

    /// <summary>Revokes one of the user's sessions. The user id is part of the query, so a family that
    /// belongs to somebody else matches nothing (no IDOR by guessing a session id).</summary>
    Task<int> RevokeFamilyForUserAsync(int userId, Guid familyId, DateTime now, CancellationToken cancellationToken = default);

    /// <summary>The user's live sessions - one row (the current token) per family, newest first.</summary>
    Task<IReadOnlyList<RefreshToken>> GetActiveSessionsAsync(int userId, DateTime now, CancellationToken cancellationToken = default);

    /// <summary>Removes every refresh token row of the user (device names, device hashes) - account deletion.</summary>
    Task<int> DeleteAllForUserAsync(int userId, CancellationToken cancellationToken = default);

    /// <summary>Housekeeping: drops tokens that can never be used again and are older than the cutoff.</summary>
    Task<int> DeleteDeadTokensAsync(DateTime olderThan, CancellationToken cancellationToken = default);
}

using Domain.Entities;

namespace Domain.Interfaces;

public interface IEmailTokenRepository : IRepository<EmailToken>
{
    /// <summary>The token row for this hash and purpose if it can still be used (not used, not expired); otherwise null.</summary>
    Task<EmailToken?> GetUsableAsync(string tokenHash, EmailTokenPurpose purpose, DateTime now, CancellationToken cancellationToken = default);

    /// <summary>
    /// Atomically marks the token as used, but only while it is still unused and unexpired (one conditional UPDATE): of several
    /// concurrent requests with the same token exactly one gets true.
    /// </summary>
    Task<bool> TryConsumeAsync(int id, DateTime now, CancellationToken cancellationToken = default);

    /// <summary>Removes the user's not-yet-used tokens of this purpose (a new one is being issued, or the password changed).</summary>
    Task<int> DeleteUnusedAsync(int userId, EmailTokenPurpose purpose, CancellationToken cancellationToken = default);

    /// <summary>Removes every token row of the user - account deletion.</summary>
    Task<int> DeleteAllForUserAsync(int userId, CancellationToken cancellationToken = default);

    /// <summary>Housekeeping: drops tokens that expired or were used before the cutoff.</summary>
    Task<int> DeleteDeadAsync(DateTime olderThan, CancellationToken cancellationToken = default);
}

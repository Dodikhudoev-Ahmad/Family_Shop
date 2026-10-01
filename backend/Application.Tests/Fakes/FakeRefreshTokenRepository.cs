using Domain.Entities;
using Domain.Interfaces;

namespace Application.Tests.Fakes;

/// <summary>In-memory refresh-token store whose conditional operations are atomic (like the real
/// ExecuteUpdate statements), so concurrency and revocation behaviour can be tested without a database.</summary>
public class FakeRefreshTokenRepository : IRefreshTokenRepository
{
    private readonly object _gate = new();
    private readonly Dictionary<int, User> _users = new();
    private int _nextId = 1;

    public List<RefreshToken> Tokens { get; } = new();
    public int DeleteDeadCalls { get; private set; }

    public void RegisterUser(User user) => _users[user.Id] = user;

    public Task AddAsync(RefreshToken entity, CancellationToken cancellationToken = default)
    {
        lock (_gate)
        {
            entity.Id = _nextId++;
            Tokens.Add(entity);
        }

        return Task.CompletedTask;
    }

    public Task<RefreshToken?> GetByTokenHashAsync(string tokenHash, CancellationToken cancellationToken = default)
    {
        lock (_gate)
        {
            var token = Tokens.FirstOrDefault(t => t.TokenHash == tokenHash);
            if (token is not null && _users.TryGetValue(token.UserId, out var user))
            {
                token.User = user;
            }

            return Task.FromResult(token);
        }
    }

    public Task<bool> TryMarkRotatedAsync(int id, DateTime now, CancellationToken cancellationToken = default)
    {
        lock (_gate)
        {
            var token = Tokens.FirstOrDefault(t => t.Id == id);
            if (token is null || token.RotatedAt is not null || token.RevokedAt is not null)
            {
                return Task.FromResult(false);
            }

            token.RotatedAt = now;
            token.LastUsedAt = now;
            return Task.FromResult(true);
        }
    }

    public Task<int> RevokeFamilyAsync(Guid familyId, DateTime now, CancellationToken cancellationToken = default) =>
        Revoke(t => t.FamilyId == familyId, now);

    public Task<int> RevokeAllForUserAsync(int userId, DateTime now, CancellationToken cancellationToken = default) =>
        Revoke(t => t.UserId == userId, now);

    public Task<int> RevokeFamilyForUserAsync(int userId, Guid familyId, DateTime now, CancellationToken cancellationToken = default) =>
        Revoke(t => t.UserId == userId && t.FamilyId == familyId, now);

    private Task<int> Revoke(Func<RefreshToken, bool> match, DateTime now)
    {
        lock (_gate)
        {
            var hit = Tokens.Where(t => t.RevokedAt is null && match(t)).ToList();
            foreach (var t in hit)
            {
                t.RevokedAt = now;
            }

            return Task.FromResult(hit.Count);
        }
    }

    public Task<IReadOnlyList<RefreshToken>> GetActiveSessionsAsync(int userId, DateTime now, CancellationToken cancellationToken = default)
    {
        lock (_gate)
        {
            IReadOnlyList<RefreshToken> list = Tokens
                .Where(t => t.UserId == userId && t.RevokedAt is null && t.RotatedAt is null && t.ExpiresAt > now && t.AbsoluteExpiresAt > now)
                .OrderByDescending(t => t.LastUsedAt ?? t.CreatedAt)
                .ToList();
            return Task.FromResult(list);
        }
    }

    public Task<int> DeleteDeadTokensAsync(DateTime olderThan, CancellationToken cancellationToken = default)
    {
        DeleteDeadCalls++;
        return Task.FromResult(0);
    }

    // IRepository<RefreshToken> members the auth flow doesn't use.
    public Task<RefreshToken?> GetByIdAsync(int id, CancellationToken cancellationToken = default) =>
        Task.FromResult(Tokens.FirstOrDefault(t => t.Id == id));

    public Task<IReadOnlyList<RefreshToken>> GetAllAsync(CancellationToken cancellationToken = default) =>
        Task.FromResult<IReadOnlyList<RefreshToken>>(Tokens.ToList());

    public void Update(RefreshToken entity)
    {
    }

    public void Remove(RefreshToken entity) => Tokens.Remove(entity);

    public Task<int> SaveChangesAsync(CancellationToken cancellationToken = default) => Task.FromResult(0);
}

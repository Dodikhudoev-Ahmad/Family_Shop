using Domain.Entities;
using Domain.Interfaces;

namespace Application.Tests.Fakes;

/// <summary>In-memory token store whose conditional update is atomic (like the real single UPDATE), so a race on one token
/// can be tested without a database.</summary>
public class FakeEmailTokenRepository : IEmailTokenRepository
{
    private readonly object _gate = new();
    private int _nextId = 1;

    public List<EmailToken> Tokens { get; } = new();

    public Task AddAsync(EmailToken entity, CancellationToken cancellationToken = default)
    {
        lock (_gate)
        {
            entity.Id = _nextId++;
            Tokens.Add(entity);
        }

        return Task.CompletedTask;
    }

    public Task<EmailToken?> GetUsableAsync(string tokenHash, EmailTokenPurpose purpose, DateTime now, CancellationToken cancellationToken = default)
    {
        lock (_gate)
        {
            return Task.FromResult(Tokens.FirstOrDefault(t =>
                t.TokenHash == tokenHash && t.Purpose == purpose && t.UsedAt is null && t.ExpiresAt > now));
        }
    }

    public Task<bool> TryConsumeAsync(int id, DateTime now, CancellationToken cancellationToken = default)
    {
        lock (_gate)
        {
            var token = Tokens.FirstOrDefault(t => t.Id == id && t.UsedAt is null && t.ExpiresAt > now);
            if (token is null)
            {
                return Task.FromResult(false);
            }

            token.UsedAt = now;
            return Task.FromResult(true);
        }
    }

    public Task<int> DeleteUnusedAsync(int userId, EmailTokenPurpose purpose, CancellationToken cancellationToken = default)
    {
        lock (_gate)
        {
            return Task.FromResult(Tokens.RemoveAll(t => t.UserId == userId && t.Purpose == purpose && t.UsedAt is null));
        }
    }

    public Task<int> DeleteAllForUserAsync(int userId, CancellationToken cancellationToken = default)
    {
        lock (_gate)
        {
            return Task.FromResult(Tokens.RemoveAll(t => t.UserId == userId));
        }
    }

    public Task<int> DeleteDeadAsync(DateTime olderThan, CancellationToken cancellationToken = default)
    {
        lock (_gate)
        {
            return Task.FromResult(Tokens.RemoveAll(t => t.ExpiresAt < olderThan || (t.UsedAt is not null && t.UsedAt < olderThan)));
        }
    }

    public Task<EmailToken?> GetByIdAsync(int id, CancellationToken cancellationToken = default) =>
        Task.FromResult(Tokens.FirstOrDefault(t => t.Id == id));

    public Task<IReadOnlyList<EmailToken>> GetAllAsync(CancellationToken cancellationToken = default) =>
        Task.FromResult<IReadOnlyList<EmailToken>>(Tokens.ToList());

    public void Update(EmailToken entity)
    {
    }

    public Task<int> SaveChangesAsync(CancellationToken cancellationToken = default) => Task.FromResult(0);

    public void Remove(EmailToken entity)
    {
        lock (_gate)
        {
            Tokens.Remove(entity);
        }
    }
}

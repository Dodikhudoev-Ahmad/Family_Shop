using System.Collections.Concurrent;

namespace Application.Common;

/// <summary>
/// Per-address brake on e-mail requests (forgot password, resend), on top of the per-IP rate limit: nobody can use the shop to
/// flood someone's mailbox from many addresses. Counted for every address, known or not, so a refused request looks the same
/// as an accepted one. In process memory, like <see cref="LoginAttemptTracker"/>.
/// </summary>
public interface IEmailRequestThrottle
{
    /// <summary>True if a message may be sent for this key now (and counts it); false when the budget is used up.</summary>
    bool TryAcquire(string key);
}

public sealed class EmailRequestThrottle : IEmailRequestThrottle
{
    public const int MaxPerWindow = 3;
    public static readonly TimeSpan Window = TimeSpan.FromMinutes(15);
    private const int MaxTrackedKeys = 20_000;

    private readonly ConcurrentDictionary<string, Queue<DateTime>> _entries = new();
    private readonly Func<DateTime> _utcNow;

    public EmailRequestThrottle() : this(() => DateTime.UtcNow)
    {
    }

    public EmailRequestThrottle(Func<DateTime> utcNow)
    {
        _utcNow = utcNow;
    }

    public bool TryAcquire(string key)
    {
        var now = _utcNow();
        if (_entries.Count >= MaxTrackedKeys)
        {
            Prune(now);
        }

        var queue = _entries.GetOrAdd(key.Trim().ToLowerInvariant(), _ => new Queue<DateTime>());
        lock (queue)
        {
            while (queue.Count > 0 && now - queue.Peek() >= Window)
            {
                queue.Dequeue();
            }

            if (queue.Count >= MaxPerWindow)
            {
                return false;
            }

            queue.Enqueue(now);
            return true;
        }
    }

    private void Prune(DateTime now)
    {
        foreach (var pair in _entries)
        {
            bool dead;
            lock (pair.Value)
            {
                dead = pair.Value.Count == 0 || now - pair.Value.Peek() >= Window && now - pair.Value.Last() >= Window;
            }

            if (dead)
            {
                _entries.TryRemove(pair.Key, out _);
            }
        }

        // Still full of live entries (a flood): start over rather than grow without bound.
        if (_entries.Count >= MaxTrackedKeys)
        {
            _entries.Clear();
        }
    }
}

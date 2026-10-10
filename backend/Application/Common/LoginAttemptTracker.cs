using System.Collections.Concurrent;

namespace Application.Common;

/// <summary>
/// Per-account brake on password guessing, on top of the per-IP rate limit (an attacker spreading guesses over many
/// addresses still hits it). After <see cref="FreeAttempts"/> wrong passwords the account refuses sign-ins for a growing
/// pause (1, 2, 5, 15 minutes). The counter is kept in this process's memory: nothing is written to the database, a restart
/// clears it, and each instance counts for itself - acceptable for the single Railway instance, and it needs no migration.
/// Only accounts that really exist are counted, so the dictionary cannot be inflated by guessing random e-mail addresses,
/// and the caller answers a locked account exactly as it answers a wrong password.
/// </summary>
public interface ILoginAttemptTracker
{
    /// <summary>True while the account is in a pause: the sign-in must fail without looking at the password.</summary>
    bool IsLocked(string key);

    /// <summary>Records a wrong password for an existing account.</summary>
    void RegisterFailure(string key);

    /// <summary>Forgets the account's failures (after a correct password).</summary>
    void Reset(string key);
}

public sealed class LoginAttemptTracker : ILoginAttemptTracker
{
    public const int FreeAttempts = 5;

    // Pause after the 5th, 6th, 7th and every later wrong password.
    private static readonly TimeSpan[] Pauses =
    {
        TimeSpan.FromMinutes(1), TimeSpan.FromMinutes(2), TimeSpan.FromMinutes(5), TimeSpan.FromMinutes(15)
    };

    // Failures older than this are forgotten, so an honest typo made a week ago does not count.
    private static readonly TimeSpan Memory = TimeSpan.FromHours(1);

    private const int MaxTrackedAccounts = 50_000;

    private readonly ConcurrentDictionary<string, Entry> _entries = new();
    private readonly Func<DateTime> _utcNow;

    public LoginAttemptTracker() : this(() => DateTime.UtcNow)
    {
    }

    public LoginAttemptTracker(Func<DateTime> utcNow)
    {
        _utcNow = utcNow;
    }

    public bool IsLocked(string key)
    {
        if (!_entries.TryGetValue(Normalize(key), out var entry))
        {
            return false;
        }

        lock (entry)
        {
            return entry.LockedUntil > _utcNow();
        }
    }

    public void RegisterFailure(string key)
    {
        var now = _utcNow();
        PruneIfFull(now);

        var entry = _entries.GetOrAdd(Normalize(key), _ => new Entry());
        lock (entry)
        {
            // Wrong passwords typed while the pause is running are not counted: the pause never grows by itself.
            if (entry.LockedUntil > now)
            {
                return;
            }

            if (now - entry.LastFailure > Memory)
            {
                entry.Failures = 0;
            }

            entry.Failures++;
            entry.LastFailure = now;

            if (entry.Failures >= FreeAttempts)
            {
                var index = Math.Min(entry.Failures - FreeAttempts, Pauses.Length - 1);
                entry.LockedUntil = now + Pauses[index];
            }
        }
    }

    public void Reset(string key) => _entries.TryRemove(Normalize(key), out _);

    private static string Normalize(string key) => key.Trim().ToLowerInvariant();

    private void PruneIfFull(DateTime now)
    {
        if (_entries.Count < MaxTrackedAccounts)
        {
            return;
        }

        foreach (var pair in _entries)
        {
            if (now - pair.Value.LastFailure > Memory && pair.Value.LockedUntil <= now)
            {
                _entries.TryRemove(pair.Key, out _);
            }
        }
    }

    private sealed class Entry
    {
        public int Failures;
        public DateTime LastFailure = DateTime.MinValue;
        public DateTime LockedUntil = DateTime.MinValue;
    }
}

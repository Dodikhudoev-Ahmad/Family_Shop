using Domain.Entities;

namespace Application.Common;

/// <summary>Lifetimes and limits for refresh-token sessions, in one place.</summary>
public static class SessionPolicy
{
    /// <summary>Idle lifetime of a token: how long a session survives without a refresh.</summary>
    public static TimeSpan IdleLifetime(ClientType type) =>
        type == ClientType.Mobile ? TimeSpan.FromDays(7) : TimeSpan.FromDays(14);

    /// <summary>Hard cap from the moment of login, however often the token is rotated. Without it a
    /// stolen-and-kept-fresh token chain would live forever.</summary>
    public static TimeSpan AbsoluteLifetime(ClientType type) =>
        type == ClientType.Mobile ? TimeSpan.FromDays(30) : TimeSpan.FromDays(60);

    /// <summary>A rotated token presented again within this window is treated as a benign race (two
    /// tabs refreshing at once) rather than theft: the request fails but the session survives.</summary>
    public static readonly TimeSpan RotationReuseGrace = TimeSpan.FromSeconds(10);

    /// <summary>Most simultaneously active sessions per user and client type; the oldest are revoked.</summary>
    public const int MaxSessionsPerUser = 10;

    /// <summary>Dead tokens (expired/revoked/rotated) are deleted this long after they stopped working.</summary>
    public static readonly TimeSpan DeadTokenRetention = TimeSpan.FromDays(30);
}

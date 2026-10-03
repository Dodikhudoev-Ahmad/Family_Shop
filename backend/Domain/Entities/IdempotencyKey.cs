namespace Domain.Entities;

/// <summary>
/// The outcome of a request that carried an <c>Idempotency-Key</c> (order creation): the same user sending the same key
/// with the same body gets the saved response back instead of a second order. Unique on (UserId, Key). The row is
/// claimed inside the order transaction, so it exists only if the order does; rows older than 24 h are removed.
/// </summary>
public class IdempotencyKey
{
    public int Id { get; set; }
    public string Key { get; set; } = string.Empty;
    public int UserId { get; set; }
    public User? User { get; set; }

    /// <summary>SHA-256 (hex) of the canonical request body: the same key with a different body is a client bug (422).</summary>
    public string RequestHash { get; set; } = string.Empty;

    /// <summary>HTTP status of the saved response (0 while the claiming transaction has not finished).</summary>
    public int ResponseStatus { get; set; }

    /// <summary>The saved response payload (JSON); null until the request completes.</summary>
    public string? ResponseBody { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

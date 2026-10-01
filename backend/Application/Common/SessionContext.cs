using Domain.Entities;

namespace Application.Common;

/// <summary>
/// What kind of client is asking, decided by the server from which endpoint was called - never from a
/// header the client could forge. <see cref="DeviceId"/> is only meaningful for mobile.
/// </summary>
public sealed record SessionContext(ClientType Type, string? DeviceId = null, string? DeviceName = null)
{
    public static readonly SessionContext Web = new(ClientType.Web);
}

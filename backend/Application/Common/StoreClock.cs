namespace Application.Common;

/// <summary>
/// "Today", "this week" and "this month" as the shop's staff understand them: calendar boundaries in the shop's time zone
/// (<c>Store:TimeZone</c>, default Asia/Almaty, UTC+5), not in UTC. Dates are still stored in UTC; this only turns a local
/// boundary into the UTC instant to compare stored dates with. Without it an order placed at 00:30 in Almaty (19:30 UTC the
/// day before) would be counted for yesterday, and one at 23:30 for the right day only by luck.
/// Weeks start on Monday.
/// </summary>
public class StoreClock
{
    public const string DefaultTimeZoneId = "Asia/Almaty";

    private readonly Func<DateTime> _utcNow;

    public StoreClock(TimeZoneInfo zone, Func<DateTime>? utcNow = null)
    {
        Zone = zone;
        _utcNow = utcNow ?? (() => DateTime.UtcNow);
    }

    /// <summary>The configured zone, or - on a host without time zone data - Almaty's fixed offset (+05:00 since 2024-03-01).</summary>
    public static StoreClock FromId(string? id, Func<DateTime>? utcNow = null)
    {
        id = string.IsNullOrWhiteSpace(id) ? DefaultTimeZoneId : id.Trim();
        try
        {
            return new StoreClock(TimeZoneInfo.FindSystemTimeZoneById(id), utcNow);
        }
        catch (Exception ex) when (ex is TimeZoneNotFoundException or InvalidTimeZoneException && id == DefaultTimeZoneId)
        {
            return new StoreClock(TimeZoneInfo.CreateCustomTimeZone(DefaultTimeZoneId, TimeSpan.FromHours(5), DefaultTimeZoneId, DefaultTimeZoneId), utcNow);
        }
    }

    public static StoreClock Default { get; } = FromId(null);

    public TimeZoneInfo Zone { get; }

    /// <summary>The IANA id (e.g. "Asia/Almaty"), for clients that format dates for the shop.</summary>
    public string ZoneId => Zone.Id;

    public DateTime UtcNow => _utcNow();

    public DateTime ToLocal(DateTime utc) =>
        TimeZoneInfo.ConvertTimeFromUtc(DateTime.SpecifyKind(utc, DateTimeKind.Utc), Zone);

    /// <summary>The UTC instant at which the given calendar day (its date part, whatever the kind) begins in the shop.</summary>
    public DateTime StartOfLocalDayUtc(DateTime date)
    {
        var local = DateTime.SpecifyKind(date.Date, DateTimeKind.Unspecified);
        if (Zone.IsInvalidTime(local))
        {
            local = local.AddHours(1); // a day that starts inside a daylight-saving gap
        }

        return TimeZoneInfo.ConvertTimeToUtc(local, Zone);
    }

    public DateTime StartOfTodayUtc() => StartOfLocalDayUtc(ToLocal(UtcNow));

    public DateTime StartOfWeekUtc()
    {
        var today = ToLocal(UtcNow).Date;
        return StartOfLocalDayUtc(today.AddDays(-(((int)today.DayOfWeek + 6) % 7)));
    }

    public DateTime StartOfMonthUtc()
    {
        var today = ToLocal(UtcNow);
        return StartOfLocalDayUtc(new DateTime(today.Year, today.Month, 1));
    }

    /// <summary>The last instant of the given calendar day, for an inclusive "up to this date" filter.</summary>
    public DateTime EndOfLocalDayUtc(DateTime date) => StartOfLocalDayUtc(date.Date.AddDays(1)).AddTicks(-1);
}

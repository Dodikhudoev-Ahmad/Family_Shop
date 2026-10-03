using Xunit;
using Application.Common;

namespace Application.Tests.Services;

/// <summary>The shop's calendar: day, week and month boundaries in Asia/Almaty (UTC+5), expressed as UTC instants.</summary>
public class StoreClockTests
{
    private static StoreClock At(DateTime utcNow) => StoreClock.FromId("Asia/Almaty", () => DateTime.SpecifyKind(utcNow, DateTimeKind.Utc));

    private static DateTime Utc(int y, int m, int d, int h = 0, int min = 0) => new(y, m, d, h, min, 0, DateTimeKind.Utc);

    [Fact]
    public void TheDefaultShopZoneIsAlmaty_UtcPlusFive()
    {
        var clock = StoreClock.FromId(null);

        Assert.Equal(TimeSpan.FromHours(5), clock.Zone.GetUtcOffset(Utc(2026, 10, 3)));
        Assert.Equal(TimeSpan.FromHours(5), clock.Zone.GetUtcOffset(Utc(2026, 1, 3)));
        Assert.Equal(clock.Zone.Id, clock.ZoneId);
    }

    [Fact]
    public void TheZoneComesFromConfiguration()
    {
        Assert.Equal(TimeSpan.FromHours(3), StoreClock.FromId("Europe/Moscow").Zone.GetUtcOffset(Utc(2026, 10, 3)));
    }

    [Fact]
    public void AnUnknownZoneIsAConfigurationError_NotASilentFallbackToUtc()
    {
        Assert.ThrowsAny<Exception>(() => StoreClock.FromId("Mars/Olympus_Mons"));
    }

    // ---- today ----

    [Fact]
    public void At0030Local_ItIsAlreadyTheNewDay_EvenThoughUtcStillSaysYesterday()
    {
        // 00:30 on 4 Oct in Almaty is 19:30 on 3 Oct UTC.
        var clock = At(Utc(2026, 10, 3, 19, 30));

        Assert.Equal(Utc(2026, 10, 3, 19, 0), clock.StartOfTodayUtc()); // local midnight of 4 Oct
    }

    [Fact]
    public void At2330Local_ItIsStillTheSameDay_EvenThoughUtcIsEarlier()
    {
        // 23:30 on 3 Oct in Almaty is 18:30 on 3 Oct UTC.
        var clock = At(Utc(2026, 10, 3, 18, 30));

        Assert.Equal(Utc(2026, 10, 2, 19, 0), clock.StartOfTodayUtc()); // local midnight of 3 Oct
    }

    [Fact]
    public void TheBoundaryIsExact_OneMinuteEitherSide()
    {
        Assert.Equal(Utc(2026, 10, 2, 19, 0), At(Utc(2026, 10, 3, 18, 59)).StartOfTodayUtc());
        Assert.Equal(Utc(2026, 10, 3, 19, 0), At(Utc(2026, 10, 3, 19, 0)).StartOfTodayUtc());
    }

    // ---- week (Monday) and month ----

    [Theory]
    [InlineData(2026, 10, 5, 3, 0, 2026, 10, 4, 19)]   // Monday 08:00 local -> that Monday 00:00 local = Sunday 19:00 UTC
    [InlineData(2026, 10, 4, 18, 30, 2026, 9, 27, 19)] // Sunday 23:30 local: still the week that began Monday 28 Sep
    [InlineData(2026, 10, 4, 19, 30, 2026, 10, 4, 19)] // Monday 00:30 local: a new week has begun
    [InlineData(2026, 10, 7, 10, 0, 2026, 10, 4, 19)]  // Wednesday
    public void TheWeekStartsOnMonday_AtLocalMidnight(int y, int m, int d, int h, int min, int ey, int em, int ed, int eh)
    {
        Assert.Equal(Utc(ey, em, ed, eh), At(Utc(y, m, d, h, min)).StartOfWeekUtc());
    }

    [Theory]
    [InlineData(2026, 10, 15, 10, 0, 2026, 9, 30, 19)]  // 1 Oct 00:00 local = 30 Sep 19:00 UTC
    [InlineData(2026, 10, 31, 18, 30, 2026, 9, 30, 19)] // 31 Oct 23:30 local: still October
    [InlineData(2026, 10, 31, 19, 30, 2026, 10, 31, 19)] // 1 Nov 00:30 local: November has begun
    [InlineData(2027, 1, 1, 2, 0, 2026, 12, 31, 19)]    // 1 Jan 07:00 local
    public void TheMonthStartsOnTheFirst_AtLocalMidnight(int y, int m, int d, int h, int min, int ey, int em, int ed, int eh)
    {
        Assert.Equal(Utc(ey, em, ed, eh), At(Utc(y, m, d, h, min)).StartOfMonthUtc());
    }

    // ---- date filters ----

    [Fact]
    public void ACalendarDayFilter_RunsFromLocalMidnightToTheLastInstantOfTheLocalDay()
    {
        var clock = At(Utc(2026, 10, 3, 12));

        var from = clock.StartOfLocalDayUtc(new DateTime(2026, 10, 3));
        var to = clock.EndOfLocalDayUtc(new DateTime(2026, 10, 3));

        Assert.Equal(Utc(2026, 10, 2, 19, 0), from);
        Assert.Equal(Utc(2026, 10, 3, 19, 0).AddTicks(-1), to);
        Assert.Equal(TimeSpan.FromDays(1).Ticks - 1, (to - from).Ticks);
    }

    [Fact]
    public void ADateWithATimeOrAKind_IsTreatedAsItsCalendarDay()
    {
        var clock = At(Utc(2026, 10, 3, 12));

        Assert.Equal(clock.StartOfLocalDayUtc(new DateTime(2026, 10, 3)), clock.StartOfLocalDayUtc(new DateTime(2026, 10, 3, 17, 45, 0, DateTimeKind.Utc)));
    }
}

using Application.Common;
using Application.DTOs;

namespace Application.Interfaces;

public interface IPromoCodeService
{
    /// <summary>Validates a code against an order subtotal and previews the discount, without applying it.</summary>
    Task<Result<PromoCodeApplicationDto>> ValidateAndApplyAsync(string code, decimal orderSubtotal, CancellationToken cancellationToken = default);

    Task<PagedResult<PromoCodeDto>> GetPromoCodesAsync(PromoCodeFilterDto filter, CancellationToken cancellationToken = default);
    Task<Result<PromoCodeDto>> CreatePromoCodeAsync(PromoCodeUpsertDto dto, CancellationToken cancellationToken = default);
    Task<Result<PromoCodeDto>> UpdatePromoCodeAsync(int id, PromoCodeUpsertDto dto, CancellationToken cancellationToken = default);
    Task<Result<bool>> DeletePromoCodeAsync(int id, CancellationToken cancellationToken = default);
}

using Application.Common;
using Application.DTOs;
using Application.Interfaces;
using Domain.Entities;
using Domain.Interfaces;

namespace Application.Services;

public class PromoCodeService : IPromoCodeService
{
    private readonly IUnitOfWork _unitOfWork;

    public PromoCodeService(IUnitOfWork unitOfWork)
    {
        _unitOfWork = unitOfWork;
    }

    public async Task<Result<PromoCodeApplicationDto>> ValidateAndApplyAsync(string code, decimal orderSubtotal, CancellationToken cancellationToken = default)
    {
        var normalizedCode = code.Trim().ToUpperInvariant();
        var promoCode = await _unitOfWork.PromoCodes.GetByCodeAsync(normalizedCode, cancellationToken);
        if (promoCode is null)
        {
            return Result<PromoCodeApplicationDto>.Failure("Промокод не найден.");
        }

        var evaluation = PromoCodePolicy.Evaluate(promoCode, orderSubtotal, DateTime.UtcNow);
        if (!evaluation.IsSuccess)
        {
            return Result<PromoCodeApplicationDto>.Failure(evaluation.Errors);
        }

        return Result<PromoCodeApplicationDto>.Success(new PromoCodeApplicationDto(
            promoCode.Id,
            promoCode.Code,
            promoCode.DiscountType,
            promoCode.DiscountValue,
            evaluation.Value!.DiscountAmount,
            evaluation.Value.FinalTotal));
    }

    public async Task<PagedResult<PromoCodeDto>> GetPromoCodesAsync(PromoCodeFilterDto filter, CancellationToken cancellationToken = default)
    {
        var (items, totalCount) = await _unitOfWork.PromoCodes.GetByFilterAsync(filter.Page, filter.PageSize, cancellationToken);
        return new PagedResult<PromoCodeDto>(items.Select(ToDto).ToList(), totalCount, filter.Page, filter.PageSize);
    }

    public async Task<Result<PromoCodeDto>> CreatePromoCodeAsync(PromoCodeUpsertDto dto, CancellationToken cancellationToken = default)
    {
        var code = dto.Code.Trim().ToUpperInvariant();

        if (await _unitOfWork.PromoCodes.AnyByCodeAsync(code, null, cancellationToken))
        {
            return Result<PromoCodeDto>.Failure("Промокод с таким кодом уже существует.");
        }

        var promoCode = new PromoCode
        {
            Code = code,
            DiscountType = dto.DiscountType,
            DiscountValue = dto.DiscountValue,
            MinOrderAmount = dto.MinOrderAmount,
            MaxDiscountAmount = dto.MaxDiscountAmount,
            ValidFrom = dto.ValidFrom,
            ValidUntil = dto.ValidUntil,
            UsageLimit = dto.UsageLimit,
            UsageCount = 0,
            IsActive = dto.IsActive
        };

        await _unitOfWork.PromoCodes.AddAsync(promoCode, cancellationToken);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        return Result<PromoCodeDto>.Success(ToDto(promoCode));
    }

    public async Task<Result<PromoCodeDto>> UpdatePromoCodeAsync(int id, PromoCodeUpsertDto dto, CancellationToken cancellationToken = default)
    {
        var promoCode = await _unitOfWork.PromoCodes.GetByIdAsync(id, cancellationToken);
        if (promoCode is null)
        {
            return Result<PromoCodeDto>.Failure("Промокод не найден.");
        }

        var code = dto.Code.Trim().ToUpperInvariant();

        if (await _unitOfWork.PromoCodes.AnyByCodeAsync(code, id, cancellationToken))
        {
            return Result<PromoCodeDto>.Failure("Промокод с таким кодом уже существует.");
        }

        promoCode.Code = code;
        promoCode.DiscountType = dto.DiscountType;
        promoCode.DiscountValue = dto.DiscountValue;
        promoCode.MinOrderAmount = dto.MinOrderAmount;
        promoCode.MaxDiscountAmount = dto.MaxDiscountAmount;
        promoCode.ValidFrom = dto.ValidFrom;
        promoCode.ValidUntil = dto.ValidUntil;
        promoCode.UsageLimit = dto.UsageLimit;
        promoCode.IsActive = dto.IsActive;

        _unitOfWork.PromoCodes.Update(promoCode);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        return Result<PromoCodeDto>.Success(ToDto(promoCode));
    }

    public async Task<Result<bool>> DeletePromoCodeAsync(int id, CancellationToken cancellationToken = default)
    {
        var promoCode = await _unitOfWork.PromoCodes.GetByIdAsync(id, cancellationToken);
        if (promoCode is null)
        {
            return Result<bool>.Failure("Промокод не найден.");
        }

        _unitOfWork.PromoCodes.Remove(promoCode);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        return Result<bool>.Success(true);
    }

    private static PromoCodeDto ToDto(PromoCode p) => new(
        p.Id,
        p.Code,
        p.DiscountType,
        p.DiscountValue,
        p.MinOrderAmount,
        p.MaxDiscountAmount,
        p.ValidFrom,
        p.ValidUntil,
        p.UsageLimit,
        p.UsageCount,
        p.IsActive);
}

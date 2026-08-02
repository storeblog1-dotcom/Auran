package com.anonymous.frontend.nativetext

import android.content.Context
import android.graphics.Color
import android.os.Build
import android.text.Layout
import android.util.TypedValue
import android.view.Gravity
import android.view.ViewGroup
import androidx.appcompat.widget.AppCompatTextView

class NativeMessageTextView(context: Context) : AppCompatTextView(context) {

    companion object {
        const val SAFE_MEASURE_EXTRA_DP = 2f
    }

    init {
        layoutParams = ViewGroup.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT,
            ViewGroup.LayoutParams.WRAP_CONTENT
        )
        setSingleLine(false)
        maxLines = Int.MAX_VALUE
        ellipsize = null
        includeFontPadding = true
        gravity = Gravity.START
        textAlignment = TEXT_ALIGNMENT_VIEW_START
        setHorizontallyScrolling(false)
        setTextIsSelectable(false)
        importantForAccessibility = IMPORTANT_FOR_ACCESSIBILITY_YES

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            breakStrategy = Layout.BREAK_STRATEGY_SIMPLE
            hyphenationFrequency = Layout.HYPHENATION_FREQUENCY_NONE
        }
    }

    override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
        super.onMeasure(widthMeasureSpec, heightMeasureSpec)

        val originalWidth = measuredWidth
        val originalHeight = measuredHeight

        val extraPx = TypedValue.applyDimension(
            TypedValue.COMPLEX_UNIT_DIP,
            SAFE_MEASURE_EXTRA_DP,
            resources.displayMetrics
        ).toInt()

        setMeasuredDimension(
            originalWidth + extraPx,
            originalHeight
        )
    }

    fun setTextValue(value: String?) {
        text = value ?: ""
        requestLayout()
        invalidate()
    }

    fun setColorValue(colorStr: String?) {
        if (!colorStr.isNullOrEmpty()) {
            try {
                setTextColor(Color.parseColor(colorStr))
            } catch (_: Exception) {
                // If parse fails, fallback to default text color
            }
        }
    }

    fun setFontSizeValue(fontSizeSp: Float) {
        if (fontSizeSp > 0) {
            setTextSize(TypedValue.COMPLEX_UNIT_SP, fontSizeSp)
            requestLayout()
            invalidate()
        }
    }

    fun setLineHeightValue(lineHeightDp: Float) {
        if (lineHeightDp > 0 && Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            val px = TypedValue.applyDimension(
                TypedValue.COMPLEX_UNIT_DIP,
                lineHeightDp,
                resources.displayMetrics
            ).toInt()
            setLineHeight(px)
            requestLayout()
            invalidate()
        }
    }

    fun setSelectableValue(selectable: Boolean) {
        setTextIsSelectable(selectable)
    }

    fun setMaxLinesValue(max: Int) {
        maxLines = if (max > 0) max else Int.MAX_VALUE
        requestLayout()
        invalidate()
    }

    fun setIncludeFontPaddingValue(includePadding: Boolean) {
        includeFontPadding = includePadding
        requestLayout()
        invalidate()
    }

    fun setBreakStrategyValue(strategyStr: String?) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            breakStrategy = when (strategyStr?.lowercase()) {
                "highquality" -> Layout.BREAK_STRATEGY_HIGH_QUALITY
                "balanced" -> Layout.BREAK_STRATEGY_BALANCED
                else -> Layout.BREAK_STRATEGY_SIMPLE
            }
            requestLayout()
            invalidate()
        }
    }

    fun setHyphenationFrequencyValue(frequencyStr: String?) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            hyphenationFrequency = when (frequencyStr?.lowercase()) {
                "normal" -> Layout.HYPHENATION_FREQUENCY_NORMAL
                "full" -> Layout.HYPHENATION_FREQUENCY_FULL
                else -> Layout.HYPHENATION_FREQUENCY_NONE
            }
            requestLayout()
            invalidate()
        }
    }
}

package com.anonymous.frontend.nativetext

import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.annotations.ReactProp

class NativeMessageTextManager : SimpleViewManager<NativeMessageTextView>() {

    override fun getName(): String {
        return REACT_CLASS
    }

    override fun createViewInstance(reactContext: ThemedReactContext): NativeMessageTextView {
        return NativeMessageTextView(reactContext)
    }

    @ReactProp(name = "text")
    fun setText(view: NativeMessageTextView, value: String?) {
        view.setTextValue(value)
    }

    @ReactProp(name = "color")
    fun setColor(view: NativeMessageTextView, value: String?) {
        view.setColorValue(value)
    }

    @ReactProp(name = "fontSize", defaultFloat = 15f)
    fun setFontSize(view: NativeMessageTextView, value: Float) {
        view.setFontSizeValue(value)
    }

    @ReactProp(name = "lineHeight", defaultFloat = 0f)
    fun setLineHeight(view: NativeMessageTextView, value: Float) {
        view.setLineHeightValue(value)
    }

    @ReactProp(name = "selectable", defaultBoolean = false)
    fun setSelectable(view: NativeMessageTextView, value: Boolean) {
        view.setSelectableValue(value)
    }

    @ReactProp(name = "maxLines", defaultInt = Int.MAX_VALUE)
    fun setMaxLines(view: NativeMessageTextView, value: Int) {
        view.setMaxLinesValue(value)
    }

    @ReactProp(name = "includeFontPadding", defaultBoolean = true)
    fun setIncludeFontPadding(view: NativeMessageTextView, value: Boolean) {
        view.setIncludeFontPaddingValue(value)
    }

    @ReactProp(name = "breakStrategy")
    fun setBreakStrategy(view: NativeMessageTextView, value: String?) {
        view.setBreakStrategyValue(value)
    }

    @ReactProp(name = "hyphenationFrequency")
    fun setHyphenationFrequency(view: NativeMessageTextView, value: String?) {
        view.setHyphenationFrequencyValue(value)
    }

    companion object {
        const val REACT_CLASS = "NativeMessageText"
    }
}

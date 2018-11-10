(function () {
  const template = document.createElement('template')
  template.innerHTML = `
    <style>
    
      :host {
        contain: content;
      }
      
      .annotate {
        font-style: italic;
        color: #366ED4;
      }

      .hidden {
        display: none;
      }

      .combobox-wrapper {
        display: inline-block;
        position: relative;
        font-size: 16px;
      }

      .combobox-label {
        font-size: 14px;
        font-weight: bold;
        margin-right: 5px;
      }

      .listbox, .grid {
        min-width: 230px;
        background: white;
        border: 1px solid #ccc;
        list-style: none;
        margin: 0;
        padding: 0;
        position: absolute;
        top: 1.7em;
        z-index: 1;
      }
      
      .listbox .result {
        cursor: default;
        margin: 0;
      }

      .listbox .result:hover,
      .grid .result-row:hover {
        background: rgb(139, 189, 225);
      }

      .listbox .focused,
      .grid .focused {
        background: rgb(139, 189, 225);
      }

      .grid .focused-cell {
        outline-style: dotted;
        outline-color: green;
      }

      .combobox-wrapper input {
        font-size: inherit;
        border: 1px solid #aaa;
        border-radius: 2px;
        line-height: 1.5em;
        padding-right: 30px;
        width: 200px;
      }

      .combobox-dropdown {
        position: absolute;
        right: 0;
        top: 0;
        padding: 0 0 2px;
        height: 1.5em;
        border-radius: 0 2px 2px 0;
        border: 1px solid #aaa;
      }

      .grid .result-row {
        padding: 2px;
        cursor: default;
        margin: 0;
      }
      
      .grid .result-cell {
        display: inline-block;
        cursor: default;
        margin: 0;
        padding: 0 5px;
      }

      .grid .result-cell:last-child {
        float: right;
        font-size: 12px;
        font-weight: 200;
        color: #333;
        line-height: 24px;
      }

    </style>
    <div>
      <label id='label'>Label</label>
      <div class='combobox-wrapper'
        aria-expanded="false"
        aria-owns='listbox'
        aria-haspopup='listbox'
        id='combobox'>
        <input type='text'
          aria-autocomplete='both'
          aria-controls='listbox'
          aria-labelledby='label'
          id='input'/>
        <div class='combobox-dropdown'
          id='combobox-arrow'
          tabindex='-1'
          role='button'
          aria-label='Show options'>arr_down_img</div>
      </div>
      <ul aria-labelledby='label'
        role='listbox'
        id='listbox'
        class='listbox hidden'></ul>
    
    </div>
  `

  class ComboboxList extends HTMLElement {
    constructor () {
      super()
      this.attachShadow({ mode: 'open' }).appendChild(template.content.cloneNode(true))
      this.state = {
        activeIndex: -1,
        resultsCount: 0,
        shown: false,
        hasInlineAutocomplete: true,
        shouldAutoSelect: true,
      }
    }
    connectedCallback() {
      let $combobox = this.shadowRoot.getElementById('combobox')
      let $input = this.shadowRoot.getElementById('input')
      let $listbox = this.shadowRoot.getElementById('listbox')

      this.state.$combobox = $combobox
      this.state.$input = $input
      this.state.$listbox = $listbox

      this.state.data = [
        'apple',
        'ball'
      ]

      this.state.hasInlineAutocomplete = $input.getAttribute('aria-autocomplete') === 'both'

      this.bindEvents()
    }
    bindEvents() {
      let $input = this.shadowRoot.getElementById('input')
      document.body.addEventListener('click', this.checkHide.bind(this))
      $input.addEventListener('keyup', this.checkKey.bind(this))
      $input.addEventListener('keydown', this.setActiveItem.bind(this))
      $input.addEventListener('focus', this.checkShow.bind(this))
      $input.addEventListener('blur', this.checkSelection.bind(this))

      let $listbox = this.shadowRoot.getElementById('listbox')
      $listbox.addEventListener('click', this.clickItem.bind(this))

      let $arrow = this.shadowRoot.getElementById('combobox-arrow').addEventListener('click', () => {
        if (this.state.shown) {
          $input.focus()
          this.hideListbox()
        } else {
          $input.focus()
          this.updateResults(true)
        }
      })
    }

    checkKey(evt) {
      const key = evt.which || evt.keyCode

      switch (key) {
        case 38: // Up 
        case 40: // Down
        case 27: // Esc
        case 13: // Return
          evt.preventDefault()
          return
        default:
          this.updateResults(false)
      }
      if (this.state.hasInlineAutocomplete) {
        switch(key) {
          case 8: // Backspace
            return
          default:
            this.autocompleteItem()
        }
      }
    }
    async updateResults(shouldShowAll) {
      const searchString = this.shadowRoot.getElementById('input').value
      // let results = ['apple', 'ball'].filter(i => i.indexOf(searchString) === 0)

      let results = await fetchSuggestions(searchString)
      this.hideListbox()

      if (!shouldShowAll && !searchString) {
        results = []
      }


      const { 
        $listbox, 
        $combobox,
        shouldAutoSelect,
      } = this.state
      if (results.length) {
        for (let i = 0; i < results.length; i+=1) {
          const resultItem = document.createElement('li')
          resultItem.className = 'result'
          resultItem.setAttribute('role', 'option')
          resultItem.setAttribute('id', `result-item-${i}`)
          resultItem.innerText = results[i]

          if (shouldAutoSelect && i === 0) {
            resultItem.setAttribute('aria-selected', 'true')
            resultItem.classList.add('focused')
            this.state.activeIndex = 0
          }

          $listbox.appendChild(resultItem)

        }
        $listbox.classList.remove('hidden')
        $combobox.setAttribute('aria-expanded', 'true')
        this.state.resultsCount = results.length
        this.state.shown = true
        this.onShow()
      }
    }

    setActiveItem (evt) {
      const key = evt.which || evt.keyCode
      console.log('setActiveItem', key)

      let {
        $input, 
        activeIndex,
        resultsCount,
        hasInlineAutocomplete
      } = this.state
      // Esc
      if (key === 27) {
        this.hideListbox()
        window.setTimeout(() => {
          // On firefox, input does not get cleared up unless wrapped in a setTimeout
          $input.value = ''
        }, 1)
        return
      }

      if (resultsCount < 1) {
        if (hasInlineAutocomplete && (key === 40 || key === 38)) {
          this.updateResults(true)
        } else {
          return
        }
      }

      let prevActive = this.getItemAt(activeIndex)
      let activeItem

      switch (key) {
        case 38: // Up
          if (activeIndex <= 0) {
            activeIndex = resultsCount - 1
          } else {
            activeIndex --
          }
          break
        case 40: // Down
          if (activeIndex === -1 || activeIndex >= resultsCount - 1) {
            activeIndex = 0
          } else {
            activeIndex++
          }
          break
        case 13: // Return
          activeItem = this.getItemAt(activeIndex)
          this.selectItem(activeItem)
          return
        case 9: // Tab
          this.checkSelection()
          this.hideListbox()
          return
        default:
          return
      }
      evt.preventDefault()
      activeItem = this.getItemAt(activeIndex)
      this.state.activeIndex = activeIndex

      if (prevActive) {
        prevActive.classList.remove('focused')
        prevActive.setAttribute('aria-selected', 'false')
      }
      if (activeItem) {
        $input.setAttribute('aria-activedescendant', `result-item-${activeIndex}`)
        activeItem.classList.add('focused')
        activeItem.setAttribute('aria-selected', 'true')
        if (this.state.hasInlineAutocomplete) {
          $input.value = activeItem.innerText
        }
      } else {
        $input.setActive('aria-activedescendant', '')
      }
    }
    getItemAt(index) {
      return this.shadowRoot.getElementById(`result-item-${index}`)
    }
    clickItem(evt) {
      if (evt.target && evt.target.nodeName === 'LI') {
        this.selectItem(evt.target)
      }
    }
    selectItem(item) {
      if (item) {
        this.shadowRoot.getElementById('input').value = item.innerText
        this.hideListbox()
      }
    }
    checkShow (evt) {
      this.updateResults(false)
    }
    checkHide(evt) {
      if (evt.target === this.shadowRoot.getElementById('input') || this.shadowRoot.getElementById('combobox').contains(evt.target)) {
        return
      }
      this.hideListbox()
    }
    hideListbox() {
      this.state = {
        ...this.state,
        shown: false,
        activeIndex: -1,
        resultsCount: 0,
      }
      const $listbox = this.shadowRoot.getElementById('listbox')
      $listbox.innerHTML = ''
      $listbox.classList.add('hidden')

      const $combobox = this.shadowRoot.getElementById('combobox')
      $combobox.setAttribute('aria-expanded', 'false')
      this.shadowRoot.getElementById('input').setAttribute('aria-activedescendant', '')
      this.onHide()
    }
    checkSelection() {
      if (this.state.activeIndex < 0) {
        return
      }
      let activeItem = this.getItemAt(this.state.activeIndex)
      this.selectItem(activeItem)
    }
    autocompleteItem() {
      const autocompletedItem = this.shadowRoot.getElementById('listbox').querySelector('.focused')
      const inputText = this.shadowRoot.getElementById('input').value

      if (!autocompletedItem || !inputText) {
        return 
      }

      const autocomplete = autocompletedItem.innerText
      if (inputText !== autocomplete) {
        const $input = this.shadowRoot.getElementById('input')
        $input.value = autocomplete
        $input.setSelectionRange(inputText.length, autocomplete.length)
      }
    }
    onShow() {
      this.shadowRoot.getElementById('combobox-arrow').setAttribute('aria-label', 'hide options')
    }
    onHide() {
      this.shadowRoot.getElementById('combobox-arrow').setAttribute('aria-label', 'show options')
    }
  }

  window.customElements.define('combobox-list', ComboboxList)

  async function fetchSuggestions(query) {
    const response = await window.fetch(`http://localhost:8080/v1/autocomplete?query=${query}`)

    if (!response.ok) {
      const msg = await response.text()
      console.error(msg)
      return []
    }
    const {data}= await response.json()
    console.log(data)
    return data.map(i => i.text)
  }
})()

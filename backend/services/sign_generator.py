import re
from typing import List

class SignGenerator:
    def __init__(self):
        self.dictionary = {
            "hello": ["HELLO"],
            "how are you": ["HOW", "YOU"],
            "thank you": ["THANK-YOU"],
        }

    def clean_text(self, text: str):
        # remove contractions manually (basic)
        text = text.replace("I'm", "I am")
        text = text.replace("i'm", "i am")
        text = text.replace("you're", "you are")
        text = text.replace("You're", "You are")
        text = text.replace("it's", "it is")
        text = text.replace("It's", "It is")

        # remove punctuation
        text = re.sub(r"[^\w\s]", "", text)

        return text.lower()

    def text_to_sign_tokens(self, text: str) -> List[str]:
        text = self.clean_text(text)

        if text in self.dictionary:
            return self.dictionary[text]

        tokens = []
        for word in text.split():
            tokens.append(word.upper())

        return tokens

    def post_process(self, asl_tokens: List[str]) -> List[str]:
        return [token.strip().upper() for token in asl_tokens if token and token.strip()]
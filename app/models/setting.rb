class Setting < ActiveRecord::Base
	serialize :mail_list, Array
end
